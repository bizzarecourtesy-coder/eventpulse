import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from './models/User.js';

dotenv.config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

const Event = mongoose.model(
  'Event',
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      description: String,
      category: String,
      date: Date,
      location: String,
      capacity: Number,
      organizer: { type: mongoose.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  )
);

const Attendee = mongoose.model(
  'Attendee',
  new mongoose.Schema(
    {
      event: { type: mongoose.Types.ObjectId, ref: 'Event' },
      name: String,
      email: String,
      ticketType: String,
      checkedIn: { type: Boolean, default: false },
      checkedInAt: Date,
    },
    { timestamps: true }
  )
);

const Feedback = mongoose.model(
  'Feedback',
  new mongoose.Schema(
    {
      event: { type: mongoose.Types.ObjectId, ref: 'Event' },
      attendee: { type: mongoose.Types.ObjectId, ref: 'Attendee' },
      overallRating: { type: Number, min: 1, max: 5 },
      speakerRating: { type: Number, min: 1, max: 5 },
      likelihoodToRecommend: { type: Number, min: 0, max: 10 },
      comment: String,
      sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative'],
        default: 'neutral',
      },
    },
    { timestamps: true }
  )
);

const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication required' });
  }
};

const own = (id, user) => Event.findOne({ _id: id, organizer: user });

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (await User.findOne({ email: normalizedEmail })) {
    return res.status(409).json({ message: 'Email registered' });
  }

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 12),
  });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

  return res.status(201).json({
    token,
    user: { id: user._id, name: user.name, email: user.email },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid login' });
  }

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    token,
    user: { id: user._id, name: user.name, email: user.email },
  });
});

app.get('/api/events', auth, async (req, res) => {
  const events = await Event.find({ organizer: req.user.id }).sort({ date: -1 });
  return res.json(events);
});

app.post('/api/events', auth, async (req, res) => {
  const event = await Event.create({ ...req.body, organizer: req.user.id });
  return res.status(201).json(event);
});

app.put('/api/events/:id', auth, async (req, res) => {
  const event = await Event.findOneAndUpdate(
    { _id: req.params.id, organizer: req.user.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  return res.json(event);
});

app.delete('/api/events/:id', auth, async (req, res) => {
  const event = await Event.findOneAndDelete({ _id: req.params.id, organizer: req.user.id });

  if (!event) {
    return res.status(404).end();
  }

  await Promise.all([
    Attendee.deleteMany({ event: event._id }),
    Feedback.deleteMany({ event: event._id }),
  ]);

  return res.status(204).end();
});

app.get('/api/attendees', auth, async (req, res) => {
  const attendees = await Attendee.find({ event: req.query.event });
  return res.json(attendees);
});

app.post('/api/attendees', auth, async (req, res) => {
  const attendee = await Attendee.create(req.body);
  return res.status(201).json(attendee);
});

app.put('/api/attendees/:id', auth, async (req, res) => {
  const body = { ...req.body };
  if (body.checkedIn) {
    body.checkedInAt = new Date();
  }

  const attendee = await Attendee.findByIdAndUpdate(req.params.id, body, { new: true });
  return res.json(attendee);
});

app.delete('/api/attendees/:id', auth, async (req, res) => {
  await Attendee.findByIdAndDelete(req.params.id);
  return res.status(204).end();
});

app.get('/api/feedback', auth, async (req, res) => {
  const feedback = await Feedback.find({ event: req.query.event }).populate('attendee', 'name');
  return res.json(feedback);
});

app.post('/api/feedback', async (req, res) => {
  const feedback = await Feedback.create(req.body);
  return res.status(201).json(feedback);
});

app.get('/api/events/:id/analytics', auth, async (req, res) => {
  const event = await own(req.params.id, req.user.id);

  if (!event) {
    return res.status(404).end();
  }

  const [registered, checkedIn, feedback] = await Promise.all([
    Attendee.countDocuments({ event: event._id }),
    Attendee.countDocuments({ event: event._id, checkedIn: true }),
    Feedback.find({ event: event._id }),
  ]);

  const avg = (key) => {
    if (!feedback.length) {
      return 0;
    }
    const total = feedback.reduce((sum, item) => sum + (item[key] || 0), 0);
    return Number((total / feedback.length).toFixed(1));
  };

  const promoterCount = feedback.filter((item) => item.likelihoodToRecommend >= 9).length;
  const detractorCount = feedback.filter((item) => item.likelihoodToRecommend <= 6).length;

  return res.json({
    registered,
    checkedIn,
    attendanceRate: registered ? Math.round((checkedIn / registered) * 100) : 0,
    feedbackCount: feedback.length,
    feedbackRate: checkedIn ? Math.round((feedback.length / checkedIn) * 100) : 0,
    averageRating: avg('overallRating'),
    speakerRating: avg('speakerRating'),
    nps: feedback.length ? Math.round(((promoterCount - detractorCount) / feedback.length) * 100) : 0,
    insight: 'Use attendance, satisfaction and NPS together to prioritize your next event.',
  });
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventpulse';

mongoose
  .connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    app.listen(process.env.PORT || 5000, () => {
      console.log(`EventPulse API running on http://localhost:${process.env.PORT || 5000}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed; starting API without a database connection:', error.message);
    app.listen(process.env.PORT || 5000, () => {
      console.log(`EventPulse API running on http://localhost:${process.env.PORT || 5000} (database unavailable)`);
    });
  });

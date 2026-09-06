# EventPulse — Event Analytics Platform

EventPulse helps organizers turn registrations, attendance and feedback into future-planning decisions.

## Stack
React + Vite frontend; Express/Node API; MongoDB with Mongoose; JWT-ready organizer authentication; Recharts visualizations.

## Run locally
1. Install the current Node.js LTS release (it includes npm).
2. Copy `.env.example` to `server/.env` and set `MONGODB_URI` and a long `JWT_SECRET`.
3. In the project root run `npm install`, `npm --prefix client install`, `npm --prefix server install`, then `npm run dev`.
4. Open `http://localhost:5173`.

## API
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET/POST /api/events`; `PUT/DELETE /api/events/:id`
- `GET /api/events/:id/analytics`
- `GET/POST /api/attendees`; `PUT/DELETE /api/attendees/:id`
- `GET/POST /api/feedback`

Protected APIs use `Authorization: Bearer <token>`. Public feedback posting can be connected to a simple event feedback form.

## Data model
`User 1—N Event`; `Event 1—N Attendee`; `Event 1—N Feedback`; `Attendee 0—N Feedback`. Event deletion removes its attendee and feedback records. The analytics endpoint derives attendance rate, feedback rate, ratings and NPS from these relationships.

## GitHub workflow
This folder is intentionally not claimed as connected to GitHub: no remote was present. Create a GitHub repository, then run `git init`, `git add .`, `git commit -m "Initial EventPulse platform"`, `git branch -M main`, `git remote add origin <your-repository-url>`, and `git push -u origin main`.

Create GitHub Project items for: authentication, event CRUD, attendee check-in, feedback form, analytics validation, and deployment. Open an Issue for each, work in a branch such as `feature/attendee-checkin`, then link the pull request to its Issue.

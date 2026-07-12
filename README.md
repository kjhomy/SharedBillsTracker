# Household Bills Tracker — Setup

This gets you to: **signed-in with a magic link, deployed on Vercel, nothing else built yet.**
Everything below is either something 🧑‍💻 **you do**, or something ✅ **already done** for you.

---

## 1. Supabase — create the project and database

🧑‍💻 **You do this:**
1. Go to [supabase.com](https://supabase.com), sign up, click **New Project**.
2. Pick a name, a database password (save it somewhere — you likely won't need it again but it's good practice), and a region close to you (London/EU).
3. Once it's created, go to **SQL Editor** → **New query**.
4. Open `supabase-schema.sql` from this project, copy the whole file, paste it in, click **Run**.
   This creates every table from the spec (households, members, bills, splits, settlements, ratios) plus the security rules that keep one household's data invisible to another.
5. Go to **Authentication → Providers**, confirm **Email** is enabled (it is by default). We're using magic links, so no password setup needed.
6. Go to **Project Settings → API**. You'll need two values from here in step 3 below: **Project URL** and **anon public key**.

---

## 2. Get the code onto your machine

🧑‍💻 **You do this:**
1. Create a new empty repository on GitHub (no README, no .gitignore — we already have one).
2. On your machine, in a terminal:
   ```bash
   cd path/to/where/you/keep/projects
   git clone <your-empty-repo-url> household-bills-tracker
   cd household-bills-tracker
   ```
3. Copy every file from this project into that folder (I'll hand you the files as a zip — unzip it into the cloned folder).
4. Install dependencies:
   ```bash
   npm install
   ```

---

## 3. Connect the app to Supabase

🧑‍💻 **You do this:**
1. In the project folder, copy `.env.local.example` to a new file called `.env.local`.
2. Paste in the two values from Supabase step 1.6:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. Run it locally:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` — you should be redirected to `/login`. Enter your email, check your inbox, click the link. You should land on a page that says "You're in 🎉".

If that works, auth is fully wired up end to end.

---

## 4. Create your household (one-time, manual)

Self-invite links come in a later phase — for now, create your household directly in Supabase.

🧑‍💻 **You do this:**
1. In Supabase, go to **Authentication → Users** and note your own user ID (you'll see it after you've signed in once via the app).
2. Go to **SQL Editor** and run (replace the placeholders):
   ```sql
   insert into households (name) values ('Our Household') returning id;
   -- copy the returned id, then:
   insert into household_members (household_id, user_id, name, joined_date)
   values ('<household-id-from-above>', '<your-user-id>', 'You', current_date);
   insert into household_members (household_id, name, joined_date)
   values ('<household-id-from-above>', 'Kofi', current_date);
   -- Kofi's user_id stays null until he signs in himself later —
   -- he can still be tracked in bills/splits without an account.
   ```

---

## 5. Deploy to Vercel

🧑‍💻 **You do this:**
1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial scaffold: auth working"
   git push
   ```
2. Go to [vercel.com](https://vercel.com), sign up with GitHub, click **Add New → Project**, pick your repo.
3. Before deploying, add the same two environment variables from step 3 (Vercel will prompt you — **Environment Variables** section).
4. Click **Deploy**. You'll get a live URL like `household-bills-tracker.vercel.app`.
5. From now on, every `git push` auto-deploys.

---

## What's next

This gets you: real auth, a real database with the full schema, and a deployed (but mostly empty) app.
Next step is building the **Add Bill** form and **Dashboard** against these real tables — that's a separate follow-up, since it depends on you completing steps 1–5 first.

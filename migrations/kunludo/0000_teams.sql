CREATE TABLE teams (id text PRIMARY KEY NOT NULL, name text NOT NULL, club text NOT NULL, needed integer NOT NULL, timezone text NOT NULL, pin_digest text NOT NULL, pin_box text NOT NULL, games text NOT NULL);
--> statement-breakpoint
CREATE TABLE profiles (id text PRIMARY KEY NOT NULL, name text NOT NULL);
--> statement-breakpoint
CREATE TABLE memberships (team_id text NOT NULL REFERENCES teams(id), user_id text NOT NULL REFERENCES profiles(id), role text NOT NULL CHECK(role IN ('admin','member')), PRIMARY KEY(team_id,user_id));
--> statement-breakpoint
CREATE INDEX memberships_user ON memberships(user_id);
--> statement-breakpoint
CREATE TABLE commitments (user_id text NOT NULL, game_id text NOT NULL, revision integer NOT NULL, PRIMARY KEY(user_id,game_id));
--> statement-breakpoint
CREATE TABLE revision (id integer PRIMARY KEY NOT NULL, value integer NOT NULL);
--> statement-breakpoint
INSERT INTO revision VALUES (1,0);
--> statement-breakpoint
CREATE TABLE receipts (user_id text NOT NULL, command_id text NOT NULL, fingerprint text NOT NULL, team_id text, message text NOT NULL, created_at integer NOT NULL, PRIMARY KEY(user_id,command_id));
--> statement-breakpoint
CREATE TABLE join_attempts (key text PRIMARY KEY NOT NULL, start integer NOT NULL, count integer NOT NULL);

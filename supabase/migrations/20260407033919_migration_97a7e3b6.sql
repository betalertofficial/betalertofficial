ALTER TABLE alerts
ADD COLUMN game_status TEXT,
ADD COLUMN game_detail TEXT,
ADD COLUMN home_team TEXT,
ADD COLUMN away_team TEXT,
ADD COLUMN home_score INTEGER,
ADD COLUMN away_score INTEGER,
ADD COLUMN period INTEGER,
ADD COLUMN clock TEXT,
ADD COLUMN score_summary TEXT;
-- Add team_id column to triggers table with foreign key constraint
ALTER TABLE triggers 
ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_triggers_team_id ON triggers(team_id);

-- Add comment for documentation
COMMENT ON COLUMN triggers.team_id IS 'Reference to the team this trigger is monitoring';
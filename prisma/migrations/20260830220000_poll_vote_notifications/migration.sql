CREATE OR REPLACE FUNCTION notify_poll_vote_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('poll_vote_changed', COALESCE(NEW."pollId", OLD."pollId"));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "PollVote_notify_changed"
AFTER INSERT OR UPDATE OR DELETE ON "PollVote"
FOR EACH ROW EXECUTE FUNCTION notify_poll_vote_changed();

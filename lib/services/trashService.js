const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const trashRepository = require('../data/supabase/trashRepository');

async function getTrashedLeaguesAsync(db, adminClient, courseId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return trashRepository.getTrashedLeagues(adminClient, courseId);
  }

  return db.prepare("SELECT id, name, trashed_at FROM leagues WHERE course_id = ? AND status = 'trashed'").all(courseId);
}

async function trashLeagueAsync(db, adminClient, leagueId, courseId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return trashRepository.trashLeague(adminClient, leagueId, courseId);
  }

  const res = db.prepare("UPDATE leagues SET status = 'trashed', trashed_at = CURRENT_TIMESTAMP WHERE id = ? AND course_id = ? AND status != 'trashed'").run(leagueId, courseId);
  return res.changes > 0;
}

async function restoreLeagueAsync(db, adminClient, leagueId, courseId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return trashRepository.restoreLeague(adminClient, leagueId, courseId);
  }

  const res = db.prepare("UPDATE leagues SET status = 'active', trashed_at = NULL WHERE id = ? AND course_id = ? AND status = 'trashed'").run(leagueId, courseId);
  return res.changes > 0;
}

async function purgeExpiredTrashAsync(db, adminClient) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return trashRepository.purgeExpiredTrash(adminClient);
  }

  // SQLite fallback
  const expired = db.prepare("SELECT id FROM leagues WHERE status = 'trashed' AND trashed_at < datetime('now', '-30 days')").all();
  let deletedCount = 0;
  
  if (expired.length > 0) {
    db.transaction(() => {
      for (const row of expired) {
        db.prepare("DELETE FROM leagues WHERE id = ?").run(row.id);
        deletedCount++;
      }
    })();
  }
  
  return deletedCount;
}

module.exports = {
  getTrashedLeaguesAsync,
  trashLeagueAsync,
  restoreLeagueAsync,
  purgeExpiredTrashAsync
};

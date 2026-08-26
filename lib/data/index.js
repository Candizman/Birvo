const backend = require('./backend');
const operations = require('./supabase/operationsRepository');
const workspace = require('./supabase/workspaceRepository');

module.exports = {
  ...backend,
  supabase: {
    operations,
    workspace,
  },
};

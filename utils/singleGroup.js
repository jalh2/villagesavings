const Group = require('../models/Group');

const SINGLE_GROUP_MODE_MESSAGE = 'This system is configured for a single organization group.';

async function resolveSingleGroup(providedGroupId, select = null) {
  let query = Group.findOne().sort({ createdAt: 1 });
  if (select) {
    query = query.select(select);
  }

  const activeGroup = await query;

  if (!activeGroup) {
    return {
      error: {
        status: 404,
        message: 'No active group found. Create the organization group first.',
      },
    };
  }

  if (providedGroupId && String(providedGroupId) !== String(activeGroup._id)) {
    return {
      error: {
        status: 400,
        message: `${SINGLE_GROUP_MODE_MESSAGE} Use the active group only.`,
      },
    };
  }

  return { group: activeGroup };
}

module.exports = {
  resolveSingleGroup,
  SINGLE_GROUP_MODE_MESSAGE,
};

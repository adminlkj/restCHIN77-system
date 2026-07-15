import {
  bulkCreateEntity,
  bulkUpdateEntity,
  createEntity,
  deleteEntity,
  deleteManyEntity,
  getEntity,
  listEntity,
  updateEntity,
  updateManyEntity,
} from './entities.js';

function entityApi(entityName, user) {
  return {
    list: (sort = '-created_date', limit = 500) => listEntity(entityName, { sort, limit }),
    filter: (query = {}, sort = '-created_date', limit = 500) => listEntity(entityName, { query, sort, limit }),
    get: (id) => getEntity(entityName, id),
    create: (data) => createEntity(entityName, data, user),
    // postOperation calls .update(id, {status:...}) internally to change status.
    // We pass {internal:true} so updateEntity skips assertNoDirectStatusChange.
    // External API PATCH (from frontend) goes through server/index.js handleEntity
    // which calls updateEntity WITHOUT options, so the status-change guard applies.
    update: (id, data) => updateEntity(entityName, id, data, { internal: true }),
    delete: (id) => deleteEntity(entityName, id),
    bulkCreate: (items) => bulkCreateEntity(entityName, items, user),
    bulkUpdate: (items) => bulkUpdateEntity(entityName, items),
    updateMany: (query, update) => updateManyEntity(entityName, query, update),
    deleteMany: (query) => deleteManyEntity(entityName, query),
  };
}

export function createBase44Adapter(user) {
  const entities = new Proxy({}, {
    get: (_, entityName) => entityApi(String(entityName), user),
  });

  return {
    auth: {
      me: async () => user,
      isAuthenticated: async () => Boolean(user),
    },
    entities,
    asServiceRole: { entities },
  };
}
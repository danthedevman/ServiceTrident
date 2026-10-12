/** Install the shared index and retention contract on the selected backend. */
export async function initializeDatabase(db) {
  await Promise.all([
    db.collection('serviceAccounts').createIndex({ workspaceId: 1, _id: 1 }),
    db.collection('serviceAccounts').createIndex({ apiKeyHash: 1 }),
    db.collection('serviceAccessTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('serviceAccessTokens').createIndex({ accountId: 1 }),
    db.collection('identityTransactions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('identityProviders').createIndex({ workspaceId: 1 }),
    db.collection('identityLinks').createIndex({ workspaceId: 1, userId: 1 }),
    db.collection('statusSubscribers').createIndex({ workspaceId: 1, state: 1, _id: 1 }),
    db.collection('statusSubscribers').createIndex({ confirmationHash: 1 }),
    db.collection('statusSubscribers').createIndex({ unsubscribeHash: 1 }),
    db
      .collection('statusSubscribers')
      .createIndex({ state: 1, confirmationQueued: 1, createdAt: 1 }),
    db
      .collection('publicStatusUpdates')
      .createIndex({ workspaceId: 1, publicToken: 1, createdAt: -1 }),
    db.collection('publicStatusUpdates').createIndex({ fanoutDone: 1, createdAt: 1 }),
    db.collection('statusMail').createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection('statusMail').createIndex({ workspaceId: 1, status: 1 }),
    ...['statusSubscribers', 'publicStatusUpdates', 'statusMail'].map((name) =>
      db.collection(name).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ),
    db.collection('auditEvents').createIndex({ workspaceId: 1, createdAt: -1, _id: 1 }),
    db.collection('auditEvents').createIndex({ workspaceId: 1, recordType: 1, recordId: 1 }),
    ...[
      'incidents',
      'incidentComments',
      'tasks',
      'articles',
      'attachments',
      'deliveries',
      'invitations',
    ].map((name) => db.collection(name).createIndex({ workspaceId: 1, _id: 1 })),
    db.collection('statusDaily').createIndex({ '_id.userId': 1, '_id.day': 1 }),
    db.collection('statusDaily').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('attachments').createIndex({ workspaceId: 1, ownerId: 1, recordId: 1 }),
    db.collection('attachments').createIndex({ lastLinkedAt: 1 }),
    ...['incidents', 'tasks', 'articles'].map((name) =>
      db.collection(name).createIndex({ workspaceId: 1, attachmentIds: 1 }),
    ),
    db.collection('incidentComments').createIndex({ workspaceId: 1, incidentId: 1, createdAt: -1 }),
    db.collection('incidentComments').createIndex({ notificationsQueued: 1 }),
    ...['tasks', 'articles'].flatMap((name) => [
      db.collection(name).createIndex({ workspaceId: 1, updatedAt: -1 }),
      db.collection(name).createIndex({ workspaceId: 1, serviceId: 1, updatedAt: -1 }),
    ]),
    db.collection('tasks').createIndex({ workspaceId: 1, incidentId: 1, updatedAt: -1 }),
    db.collection('users').createIndex({ workspaceId: 1 }),
    db.collection('invitations').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('knowledgeBases').createIndex({ workspaceId: 1, title: 1 }),
    db.collection('articles').createIndex({ workspaceId: 1, knowledgeBaseId: 1, updatedAt: -1 }),
    db.collection('incidents').createIndex({ workspaceId: 1, createdAt: -1 }),
    db.collection('incidents').createIndex({ workspaceId: 1, serviceId: 1 }),
    db.collection('incidents').createIndex({ workspaceId: 1, 'triggeringChecks.checkedAt': 1 }),
    db
      .collection('incidents')
      .createIndex(
        { workspaceId: 1, serviceId: 1, source: 1 },
        { unique: true, partialFilterExpression: { activeAutomatic: true } },
      ),
    db.collection('deliveries').createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection('deliveries').createIndex({ workspaceId: 1, createdAt: -1 }),
    db.collection('catalogs').createIndex({ publicToken: 1 }, { unique: true, sparse: true }),
    db.collection('monitors').createIndex({ serviceId: 1 }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('monitors').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('monitors').createIndex({ paused: 1, nextCheckAt: 1 }),
    db.collection('events').createIndex({ monitorId: 1, userId: 1, _id: -1 }),
    ...['checkedAt', 'durationMs', 'statusCode'].map((field) =>
      db.collection('events').createIndex({ monitorId: 1, userId: 1, [field]: -1, _id: -1 }),
    ),
    db.collection('events').createIndex({ userId: 1, checkedAt: -1 }),
    db.collection('events').createIndex({ checkedAt: 1 }, { expireAfterSeconds: 30 * 86400 }),
  ]);
  await Promise.all([
    db.collection('contactTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('marketingInquiries').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('marketingInquiries').createIndex({ createdAt: -1 }),
  ]);
  // Retired monitor providers retain historical records but cannot run or keep credentials.
  await db.collection('monitors').updateMany(
    { type: { $exists: true, $nin: ['http', null] } },
    {
      $set: { paused: true },
      $unset: {
        connectionSecret: '',
        host: '',
        port: '',
        database: '',
        username: '',
        password: '',
        tls: '',
        authSource: '',
      },
    },
  );
}

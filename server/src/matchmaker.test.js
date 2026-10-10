const test = require('node:test');
const assert = require('node:assert/strict');
const Matchmaker = require('./matchmaker');

test('changing a username updates both active chat clients immediately', () => {
  const ownEvents = [];
  const partnerEvents = [];
  const ownSocket = {
    id: 'own-socket',
    connected: true,
    data: { userId: 'user-1', studentUser: { id: 'user-1' } },
    emit: (event, data) => ownEvents.push({ event, data })
  };
  const partnerSocket = {
    id: 'partner-socket',
    connected: true,
    data: { userId: 'user-2' },
    emit: (event, data) => partnerEvents.push({ event, data })
  };
  const io = { sockets: { sockets: new Map([
    [ownSocket.id, ownSocket],
    [partnerSocket.id, partnerSocket]
  ]) } };
  const matchmaker = new Matchmaker(io);
  matchmaker.userRooms.set(ownSocket.id, {
    partnerId: partnerSocket.id,
    yourAlias: 'Old name'
  });
  matchmaker.userRooms.set(partnerSocket.id, {
    partnerId: ownSocket.id,
    yourAlias: 'Partner',
    partnerAlias: 'Old name'
  });

  matchmaker.updateUserAlias('user-1', {
    anonymousName: 'New name',
    leelaUsername: 'Leela name',
    academicYear: '2nd'
  });

  assert.equal(matchmaker.userRooms.get(ownSocket.id).yourAlias, 'New name');
  assert.equal(matchmaker.userRooms.get(partnerSocket.id).partnerAlias, 'New name');
  assert.equal(ownSocket.data.studentUser.anonymousName, 'New name');
  assert.deepEqual(ownEvents, [{ event: 'own_alias_updated', data: { alias: 'New name' } }]);
  assert.deepEqual(partnerEvents, [{
    event: 'partner_alias_updated',
    data: { alias: 'New name', academicYear: '2nd' }
  }]);
});

test('targeted searches connect the requester to an online user by anonymous name', () => {
  const requesterEvents = [];
  const targetEvents = [];
  const makeSocket = (id, userId, events) => ({
    id,
    connected: true,
    data: { userId },
    emit: (event, data) => events.push({ event, data }),
    join: () => {},
    leave: () => {},
    to: () => ({ emit: () => {} })
  });
  const requester = makeSocket('requester-socket', 'user-1', requesterEvents);
  const target = makeSocket('target-socket', 'user-2', targetEvents);
  const io = { sockets: { sockets: new Map([
    [requester.id, requester],
    [target.id, target]
  ]) } };
  const matchmaker = new Matchmaker(io);
  target.data.studentUser = {
    anonymousName: 'Library Night Owl',
    academicYear: '2nd'
  };
  matchmaker.waitingQueue.push({
    socket: target,
    gender: 'female',
    alias: 'Library Night Owl',
    academicYear: '2nd',
    enteredAt: Date.now()
  });

  assert.equal(matchmaker.connectToUser(requester, {
    id: 'user-2',
    anonymousName: 'Library Night Owl',
    gender: 'female',
    academicYear: '2nd'
  }, {
    gender: 'male',
    alias: 'PMC Regular',
    academicYear: '1st'
  }), 'matched');

  assert.equal(matchmaker.userRooms.get(requester.id).partnerId, target.id);
  assert.equal(matchmaker.userRooms.get(target.id).partnerId, requester.id);
  assert.equal(matchmaker.waitingQueue.length, 0);
  assert.equal(requesterEvents.find(event => event.event === 'matched').data.partnerAlias, 'Library Night Owl');
  assert.equal(targetEvents.find(event => event.event === 'matched').data.partnerAlias, 'PMC Regular');
});

test('targeted searches distinguish offline, busy, and self accounts', () => {
  const requester = {
    id: 'requester-socket',
    connected: true,
    data: { userId: 'user-1' }
  };
  const io = { sockets: { sockets: new Map([[requester.id, requester]]) } };
  const matchmaker = new Matchmaker(io);
  const targetUser = { id: 'user-2', anonymousName: 'Nescafe Reader', gender: 'male' };

  assert.equal(matchmaker.connectToUser(requester, targetUser), 'offline');
  io.sockets.sockets.set('target-socket', {
    id: 'target-socket',
    connected: true,
    data: { userId: 'user-2' }
  });
  matchmaker.userRooms.set('target-socket', {});
  assert.equal(matchmaker.connectToUser(requester, targetUser), 'busy');
  assert.equal(matchmaker.connectToUser(requester, { ...targetUser, id: 'user-1' }), 'self');
});

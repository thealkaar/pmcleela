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

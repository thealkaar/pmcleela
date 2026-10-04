const { v4: uuidv4 } = require('uuid');

// Clean, authentic campus pseudonyms without any emojis
const MANIT_ALIASES = [
  'PMC Regular',
  'Hostel 4 Senior',
  'SAC Member',
  'Hostel 7 Scholar',
  'Nescafe Reader',
  'Library Night Owl',
  'Roller Senior',
  'Energy Center Student',
  'Technosearch Coder',
  'Amul Parlour Visitor',
  'Hostel 10 Scholar',
  'Hostel 8 Cricketer',
  'Hostel 3 Writer',
  'PMC Walker',
  'Campus Wanderer',
  'Hostel 1 Senior',
  'Hostel 6 Scholar',
  'Architecture Dept Senior',
  'Sports Complex Runner',
  'Maa Saraswati Temple Visitor'
];

function getRandomAlias(exclude = null) {
  const choices = MANIT_ALIASES.filter(a => a !== exclude);
  return choices[Math.floor(Math.random() * choices.length)];
}

class Matchmaker {
  constructor(io) {
    this.io = io;
    this.waitingQueue = []; // array of { socket, gender, alias, enteredAt, lastPartnerId }
    this.userRooms = new Map(); // socket.id -> { roomId, partnerId, yourAlias, partnerAlias, partnerGender }
    this.pendingMatches = new Map(); // socket.id -> pending match reservation
    this.lastPartnerMap = new Map(); // socket.id -> lastPartnerSocketId
  }

  getOnlineStats() {
    this.cleanDeadSockets();
    const onlineUsers = new Set();
    for (const socket of this.io.sockets.sockets.values()) {
      onlineUsers.add(this.getUserIdentity(socket));
    }
    return {
      waiting: this.waitingQueue.length,
      activeChats: this.userRooms.size / 2,
      totalConnected: onlineUsers.size
    };
  }

  getUserIdentity(socket) {
    return socket.data?.userId || socket.id;
  }

  cleanDeadSockets() {
    this.waitingQueue = this.waitingQueue.filter(item => item?.socket?.connected);
  }

  removeFromQueue(socketId) {
    this.waitingQueue = this.waitingQueue.filter(item => item.socket.id !== socketId);
  }

  cancelPendingMatch(socket, requeuePartner = true) {
    const reservation = this.pendingMatches.get(socket.id);
    if (!reservation) return;

    clearTimeout(reservation.timer);
    if (this.pendingMatches.get(reservation.socket.id) === reservation) {
      this.pendingMatches.delete(reservation.socket.id);
    }
    if (this.pendingMatches.get(reservation.partnerSocket.id) === reservation) {
      this.pendingMatches.delete(reservation.partnerSocket.id);
    }

    const partner = reservation.socket.id === socket.id
      ? reservation.partnerSocket
      : reservation.socket;
    const partnerInfo = reservation.socket.id === socket.id
      ? reservation.partnerInfo
      : reservation.userInfo;
    if (
      !requeuePartner ||
      !partner.connected ||
      this.userRooms.has(partner.id) ||
      this.pendingMatches.has(partner.id) ||
      this.waitingQueue.some(item => item.socket.id === partner.id)
    ) {
      return;
    }

    this.waitingQueue.push({ socket: partner, ...partnerInfo, enteredAt: Date.now() });
    partner.emit('waiting', {
      message: 'Waiting at PMC...',
      queueSize: this.waitingQueue.length
    });
  }

  enqueue(socket, userInfo = {}) {
    this.leaveRoom(socket);
    this.cleanDeadSockets();

    const userIdentity = this.getUserIdentity(socket);
    const reservations = new Set(this.pendingMatches.values());
    for (const reservation of reservations) {
      if (
        this.getUserIdentity(reservation.socket) === userIdentity ||
        this.getUserIdentity(reservation.partnerSocket) === userIdentity
      ) {
        this.cancelPendingMatch(reservation.socket);
      }
    }
    this.waitingQueue = this.waitingQueue.filter(
      item => this.getUserIdentity(item.socket) !== userIdentity
    );
    this.removeFromQueue(socket.id);

    const normalizedInfo = {
      gender: userInfo.gender === 'female' ? 'female' : 'male',
      alias: userInfo.preferredAlias || getRandomAlias(),
      academicYear: userInfo.academicYear || 'Student'
    };
    const lastPartner = this.lastPartnerMap.get(socket.id);

    const candidateIdentities = new Set([userIdentity]);
    const validCandidates = this.waitingQueue.filter(item => {
      if (!item.socket?.connected) return false;
      const identity = this.getUserIdentity(item.socket);
      if (candidateIdentities.has(identity)) return false;
      candidateIdentities.add(identity);
      return true;
    });

    if (validCandidates.length > 0) {
      let candidatesPool = validCandidates.filter(item => item.socket.id !== lastPartner);
      if (candidatesPool.length === 0) {
        candidatesPool = validCandidates;
      }

      const randomIndex = Math.floor(Math.random() * candidatesPool.length);
      const chosenPartner = candidatesPool[randomIndex];
      this.removeFromQueue(chosenPartner.socket.id);
      const matchDelay = 1400 + Math.floor(Math.random() * 800);
      const reservation = {
        socket,
        userInfo: normalizedInfo,
        partnerSocket: chosenPartner.socket,
        partnerInfo: {
          gender: chosenPartner.gender,
          alias: chosenPartner.alias,
          academicYear: chosenPartner.academicYear
        },
        timer: null
      };
      const notifyWaiting = () => socket.emit('waiting', {
        message: 'Connecting to someone at Piya Milan Chauraha...',
        queueSize: this.waitingQueue.length
      });
      notifyWaiting();
      chosenPartner.socket.emit('waiting', {
        message: 'Connecting to someone at Piya Milan Chauraha...',
        queueSize: this.waitingQueue.length
      });

      reservation.timer = setTimeout(() => {
        if (
          this.pendingMatches.get(socket.id) !== reservation ||
          this.pendingMatches.get(chosenPartner.socket.id) !== reservation
        ) return;

        this.pendingMatches.delete(socket.id);
        this.pendingMatches.delete(chosenPartner.socket.id);
        if (
          socket.connected &&
          chosenPartner.socket.connected &&
          !this.userRooms.has(socket.id) &&
          !this.userRooms.has(chosenPartner.socket.id)
        ) {
          this.pair(
            { socket, ...normalizedInfo },
            { socket: chosenPartner.socket, ...reservation.partnerInfo }
          );
        } else {
          if (socket.connected && !this.userRooms.has(socket.id)) {
            this.enqueue(socket, {
              gender: normalizedInfo.gender,
              preferredAlias: normalizedInfo.alias,
              academicYear: normalizedInfo.academicYear
            });
          }
          if (chosenPartner.socket.connected && !this.userRooms.has(chosenPartner.socket.id)) {
            this.enqueue(chosenPartner.socket, {
              gender: reservation.partnerInfo.gender,
              preferredAlias: reservation.partnerInfo.alias,
              academicYear: reservation.partnerInfo.academicYear
            });
          }
        }
      }, matchDelay);

      this.pendingMatches.set(socket.id, reservation);
      this.pendingMatches.set(chosenPartner.socket.id, reservation);
      return;
    }

    this.waitingQueue.push({ socket, ...normalizedInfo, enteredAt: Date.now(), lastPartnerId: lastPartner });
    socket.emit('waiting', {
      message: 'Waiting at PMC...',
      queueSize: this.waitingQueue.length
    });
  }

  pair(user1, user2) {
    if (
      !user1.socket.connected ||
      !user2.socket.connected ||
      this.getUserIdentity(user1.socket) === this.getUserIdentity(user2.socket) ||
      this.userRooms.has(user1.socket.id) ||
      this.userRooms.has(user2.socket.id)
    ) return;

    const roomId = `chauraha_${uuidv4()}`;
    const s1 = user1.socket;
    const s2 = user2.socket;

    const alias1 = user1.alias || getRandomAlias();
    const alias2 = user2.alias || getRandomAlias(alias1);

    s1.join(roomId);
    s2.join(roomId);

    // Save last partner mapping
    this.lastPartnerMap.set(s1.id, s2.id);
    this.lastPartnerMap.set(s2.id, s1.id);

    this.userRooms.set(s1.id, {
      roomId,
      partnerId: s2.id,
      yourAlias: alias1,
      yourAcademicYear: user1.academicYear || 'Student',
      partnerAlias: alias2,
      partnerGender: user2.gender,
      partnerAcademicYear: user2.academicYear || 'Student'
    });

    this.userRooms.set(s2.id, {
      roomId,
      partnerId: s1.id,
      yourAlias: alias2,
      yourAcademicYear: user2.academicYear || 'Student',
      partnerAlias: alias1,
      partnerGender: user1.gender,
      partnerAcademicYear: user1.academicYear || 'Student'
    });

    s1.emit('matched', {
      roomId,
      yourAlias: alias1,
      yourAcademicYear: user1.academicYear || 'Student',
      partnerAlias: alias2,
      partnerAcademicYear: user2.academicYear || 'Student',
      yourGender: user1.gender,
      partnerGender: user2.gender,
      partnerStatus: 'Online'
    });

    s2.emit('matched', {
      roomId,
      yourAlias: alias2,
      yourAcademicYear: user2.academicYear || 'Student',
      partnerAlias: alias1,
      partnerAcademicYear: user1.academicYear || 'Student',
      yourGender: user2.gender,
      partnerGender: user1.gender,
      partnerStatus: 'Online'
    });

    console.log(`[PMC Match] Paired ${s1.id} (${alias1}, ${user1.academicYear}) with ${s2.id} (${alias2}, ${user2.academicYear})`);
  }

  sendMessage(socket, text) {
    const session = this.userRooms.get(socket.id);
    if (!session) {
      socket.emit('error_message', { message: 'You are not in an active chat room.' });
      return;
    }

    const messageData = {
      id: uuidv4(),
      type: 'text',
      text,
      senderAlias: session.yourAlias,
      senderAcademicYear: session.yourAcademicYear,
      isMe: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.to(session.roomId).emit('receive_message', messageData);
  }

  sendImage(socket, imageBase64) {
    const session = this.userRooms.get(socket.id);
    if (!session) {
      socket.emit('error_message', { message: 'You are not in an active chat room.' });
      return;
    }

    const messageData = {
      id: uuidv4(),
      type: 'image',
      image: imageBase64,
      senderAlias: session.yourAlias,
      senderAcademicYear: session.yourAcademicYear,
      isMe: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.to(session.roomId).emit('receive_message', messageData);
  }

  sendTyping(socket, isTyping) {
    const session = this.userRooms.get(socket.id);
    if (session) {
      socket.to(session.roomId).emit('partner_typing', { isTyping });
    }
  }

  next(socket, userInfo = {}) {
    this.leaveRoom(socket, 'skipped');
    this.enqueue(socket, userInfo);
  }

  // Strict ephemeral wipe: purge from memory immediately upon exit
  leaveRoom(socket, reason = 'left') {
    this.removeFromQueue(socket.id);
    this.cancelPendingMatch(socket);

    const session = this.userRooms.get(socket.id);
    if (!session) return;

    const { roomId, partnerId } = session;
    this.userRooms.delete(socket.id);
    socket.leave(roomId);

    const partnerSocket = this.io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      this.userRooms.delete(partnerId);
      partnerSocket.leave(roomId);
      partnerSocket.emit('partner_disconnected', {
        reason: reason === 'skipped' ? 'Stranger skipped to someone new.' : 'Stranger left the chat.'
      });
    }
  }

  handleDisconnect(socket) {
    this.lastPartnerMap.delete(socket.id);
    this.leaveRoom(socket, 'disconnected');
  }
}

module.exports = Matchmaker;

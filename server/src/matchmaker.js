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
    this.pendingMatches = new Map(); // socket.id -> Timeout
    this.lastPartnerMap = new Map(); // socket.id -> lastPartnerSocketId
    this.activeMatchesCount = 0;
  }

  getOnlineStats() {
    this.cleanDeadSockets();
    return {
      waiting: this.waitingQueue.length,
      activeChats: this.activeMatchesCount,
      totalConnected: this.io.engine.clientsCount
    };
  }

  cleanDeadSockets() {
    this.waitingQueue = this.waitingQueue.filter(item => item && item.socket && item.socket.connected);
  }

  enqueue(socket, userInfo = {}) {
    // If already in a room, leave first
    this.leaveRoom(socket);
    this.cleanDeadSockets();

    // Cancel any previous pending match timer
    if (this.pendingMatches.has(socket.id)) {
      clearTimeout(this.pendingMatches.get(socket.id));
      this.pendingMatches.delete(socket.id);
    }

    const userGender = userInfo.gender || (Math.random() > 0.5 ? 'female' : 'male');
    const userAlias = userInfo.preferredAlias || getRandomAlias();
    const userYear = userInfo.academicYear || 'Student';
    const lastPartner = this.lastPartnerMap.get(socket.id);

    // Filter available candidates from waiting queue
    const validCandidates = this.waitingQueue.filter(
      item => item.socket && item.socket.connected && item.socket.id !== socket.id
    );

    if (validCandidates.length > 0) {
      // Prefer partners who were not the immediate previous partner
      let candidatesPool = validCandidates.filter(item => item.socket.id !== lastPartner);
      if (candidatesPool.length === 0) {
        candidatesPool = validCandidates;
      }

      // Completely RANDOM selection from candidate pool (Boy or Girl, completely randomized)
      const randomIndex = Math.floor(Math.random() * candidatesPool.length);
      const chosenPartner = candidatesPool[randomIndex];

      // Remove chosen partner from waiting queue
      this.waitingQueue = this.waitingQueue.filter(item => item.socket.id !== chosenPartner.socket.id);

      // Give both users a realistic search & connecting experience (1.4s to 2.2s delay)
      const matchDelay = 1400 + Math.floor(Math.random() * 800);

      socket.emit('waiting', {
        message: 'Connecting to someone at Piya Milan Chauraha...',
        queueSize: this.waitingQueue.length
      });

      chosenPartner.socket.emit('waiting', {
        message: 'Connecting to someone at Piya Milan Chauraha...',
        queueSize: this.waitingQueue.length
      });

      const timer = setTimeout(() => {
        this.pendingMatches.delete(socket.id);
        this.pendingMatches.delete(chosenPartner.socket.id);

        if (socket.connected && chosenPartner.socket.connected) {
          this.pair(
            { socket, gender: userGender, alias: userAlias, academicYear: userYear },
            chosenPartner
          );
        } else if (socket.connected) {
          // Re-enqueue if partner disconnected during delay
          this.enqueue(socket, { gender: userGender, preferredAlias: userAlias, academicYear: userYear });
        } else if (chosenPartner.socket.connected) {
          this.enqueue(chosenPartner.socket, { gender: chosenPartner.gender, preferredAlias: chosenPartner.alias, academicYear: chosenPartner.academicYear });
        }
      }, matchDelay);

      this.pendingMatches.set(socket.id, timer);
      this.pendingMatches.set(chosenPartner.socket.id, timer);
      return;
    }

    // No partner currently waiting, add to queue
    const existingIndex = this.waitingQueue.findIndex(item => item.socket.id === socket.id);
    if (existingIndex !== -1) {
      this.waitingQueue[existingIndex] = {
        socket,
        gender: userGender,
        alias: userAlias,
        academicYear: userYear,
        enteredAt: Date.now(),
        lastPartnerId: lastPartner
      };
    } else {
      this.waitingQueue.push({
        socket,
        gender: userGender,
        alias: userAlias,
        academicYear: userYear,
        enteredAt: Date.now(),
        lastPartnerId: lastPartner
      });
    }

    socket.emit('waiting', {
      message: 'Waiting at PMC...',
      queueSize: this.waitingQueue.length
    });
  }

  pair(user1, user2) {
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

    this.activeMatchesCount++;

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
    // Clear any pending match timer
    if (this.pendingMatches.has(socket.id)) {
      clearTimeout(this.pendingMatches.get(socket.id));
      this.pendingMatches.delete(socket.id);
    }

    this.waitingQueue = this.waitingQueue.filter(item => item.socket.id !== socket.id);

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

    if (this.activeMatchesCount > 0) {
      this.activeMatchesCount--;
    }
  }

  handleDisconnect(socket) {
    this.lastPartnerMap.delete(socket.id);
    this.leaveRoom(socket, 'disconnected');
  }
}

module.exports = Matchmaker;

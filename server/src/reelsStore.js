const { v4: uuidv4 } = require('uuid');

// Initial curated reels showcasing campus life, hostel banter, and MANIT fests
const INITIAL_REELS = [
  {
    id: 'reel-1',
    creatorName: 'Aman (ECE 3rd Yr)',
    creatorAvatar: '🎓',
    caption: 'Evening walks around Piya Milan Chauraha hit different in rainy weather 🌧️❤️ #PMC #MANIT #BhopalVibes',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=600&auto=format&fit=crop',
    likesCount: 142,
    commentsCount: 18,
    isLiked: false,
    audioTitle: 'Original Audio - PMC Acoustic Jam',
    tags: ['#PMC', '#MANIT', '#CampusDiaries'],
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    comments: [
      { id: 'c1', user: 'Hostel 4 Boy', text: 'Nescafe tea + PMC sunset = pure peace 🙌', time: '1h ago' },
      { id: 'c2', user: 'Sakshi (CSE)', text: 'Best spot on campus without a doubt!', time: '45m ago' }
    ]
  },
  {
    id: 'reel-2',
    creatorName: 'SAC Dance Club',
    creatorAvatar: '💃',
    caption: 'Stage rehearsal at SAC auditorium for Maffick 2026! Who is attending day 1? 🔥🕺 #Maffick #Dance #MANITFest',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop',
    likesCount: 389,
    commentsCount: 42,
    isLiked: false,
    audioTitle: 'Maffick Beats - High Energy Mashup',
    tags: ['#Maffick', '#DanceClub', '#SAC'],
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    comments: [
      { id: 'c3', user: 'Rohan (ME)', text: 'Energy level is insane guys! 🔥', time: '3h ago' },
      { id: 'c4', user: 'Ananya (EE)', text: 'Can\'t wait for the live performance!', time: '2h ago' }
    ]
  },
  {
    id: 'reel-3',
    creatorName: 'Hostel 10 Banter',
    creatorAvatar: '🍜',
    caption: 'Making 2 AM Maggi in hostel room during endsem exams be like... 😂🍜 #HostelLife #Endsems #2AMMaggi',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop',
    likesCount: 512,
    commentsCount: 67,
    isLiked: false,
    audioTitle: 'Funny Campus Comedy BGM',
    tags: ['#HostelLife', '#Maggi', '#MANITBhopal'],
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    comments: [
      { id: 'c5', user: 'Kunal (Civil)', text: 'Electric kettle saves lives in MANIT hostels 😂', time: '10h ago' },
      { id: 'c6', user: 'Pooja', text: 'Relatable across every college haha', time: '8h ago' }
    ]
  }
];

class ReelsStore {
  constructor() {
    this.reels = [...INITIAL_REELS];
  }

  getAll() {
    return this.reels;
  }

  getById(id) {
    return this.reels.find(r => r.id === id);
  }

  toggleLike(id) {
    const reel = this.getById(id);
    if (!reel) return null;
    reel.isLiked = !reel.isLiked;
    reel.likesCount += reel.isLiked ? 1 : -1;
    return reel;
  }

  addComment(reelId, user, text) {
    const reel = this.getById(reelId);
    if (!reel) return null;
    const comment = {
      id: `c_${uuidv4().slice(0, 8)}`,
      user: user || 'Anonymous Student',
      text,
      time: 'Just now'
    };
    reel.comments.unshift(comment);
    reel.commentsCount = reel.comments.length;
    return comment;
  }

  addReel({ creatorName, caption, videoUrl, thumbnailUrl, audioTitle, tags }) {
    const newReel = {
      id: `reel_${uuidv4().slice(0, 8)}`,
      creatorName: creatorName || 'MANITian',
      creatorAvatar: '📹',
      caption: caption || 'New campus reel at पी एम सी Leela!',
      videoUrl,
      thumbnailUrl: thumbnailUrl || 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&auto=format&fit=crop',
      likesCount: 1,
      commentsCount: 0,
      isLiked: true,
      audioTitle: audioTitle || 'Original Audio - MANIT Sound',
      tags: tags || ['#PMC', '#MANIT', '#Leela'],
      createdAt: new Date().toISOString(),
      comments: []
    };
    this.reels.unshift(newReel);
    return newReel;
  }
}

module.exports = new ReelsStore();

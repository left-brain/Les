// ELEMENTS
const audio = document.getElementById('audio');
const audioNext = document.getElementById('audio-next');
const fileInp = document.getElementById('fileUpload');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const cover = document.getElementById('cover');
const coverPh = document.getElementById('cover-ph');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const shuffleBtn = document.getElementById('shuffleBtn');
const seek = document.getElementById('seek');
const curEl = document.getElementById('cur');
const durEl = document.getElementById('dur');
const trackCountEl = document.getElementById('track-count');
const removeTrackBtn = document.getElementById('removeTrack');
const upcomingList = document.getElementById('upcomingList');
const upcomingViewport = document.querySelector('.upcoming-viewport');
const noUpcomingMessage = document.getElementById('noUpcomingMessage');
const libWarn = document.getElementById('lib-warning');
const body = document.body;
const colorThief = new ColorThief();

document.getElementById('gradient-bg').style.opacity = '1';
document.getElementById('gradient-bg').style.background = '#ffffff';

// CONFIG
const VISIBLE = 5;
const BUFFER = 1;
const PRELOAD_TIME = 5;

// STATE
let playlist = [];
let currentTrack = 0;
let animating = false;
let isShuffle = false;
let shuffledPlaylist = [];
let lastGradientSrc = null;
let isSeeking = false;
let hasPreloaded = false;

let activeAudio = audio;
let standbyAudio = audioNext;

// UTIL
const fmt = s =>
  Number.isFinite(s)
    ? `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
    : '0:00';

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h, s, l];
}

// === UI & GRADIENT FUNCTIONS ===
function updateUIColors([r, g, b]) {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness > 200) {
    body.classList.add('light-theme'); body.classList.remove('dark-theme');
  } else {
    body.classList.add('dark-theme'); body.classList.remove('light-theme');
  }
}
function setCoverGradient(imgSrc) {
  if (imgSrc === lastGradientSrc) return;
  lastGradientSrc = imgSrc;

  const gradient1 = document.getElementById('gradient-bg');
  const gradient2 = document.getElementById('gradient-bg-next');

  const activeEl = window.getComputedStyle(gradient1).opacity === '1' ? gradient1 : gradient2;
  const inactiveEl = activeEl === gradient1 ? gradient2 : gradient1;

  inactiveEl.style.background = activeEl.style.background;

  if (!imgSrc) {
    const fallback = 'linear-gradient(to bottom, #444, #222)';
    inactiveEl.style.background = fallback;
    activeEl.style.opacity = '0';
    inactiveEl.style.opacity = '1';
    updateUIColors([68, 68, 68]);

    document.documentElement.style.setProperty('--accent-color', '#6b7280'); // gray-500
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imgSrc;

  img.onload = () => {
    const palette = colorThief.getPalette(img, 2);
    
    if (!palette || palette.length < 2) {
      const dominantColor = colorThief.getColor(img);
      updateUIColors(dominantColor);
      const [r, g, b] = dominantColor;
      const darkerRgb = [Math.floor(r * 0.6), Math.floor(g * 0.6), Math.floor(b * 0.6)];

      document.documentElement.style.setProperty('--accent-color', `rgb(${darkerRgb[0]}, ${darkerRgb[1]}, ${darkerRgb[2]})`);

      const lighter = `rgba(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)}, 0.8)`;
      const darker  = `rgba(${darkerRgb[0]}, ${darkerRgb[1]}, ${darkerRgb[2]}, 0.95)`;
      inactiveEl.style.background = `linear-gradient(to bottom right, ${lighter}, ${darker})`;
      activeEl.style.opacity = '0';
      inactiveEl.style.opacity = '1';
      return;
    }

    updateUIColors(palette[0]);

    const [, s1] = rgbToHsl(...palette[0]);
    const [, s2] = rgbToHsl(...palette[1]);
    const vibrantColor = s1 >= s2 ? palette[0] : palette[1];
    const accentColor = `rgb(${vibrantColor[0]}, ${vibrantColor[1]}, ${vibrantColor[2]})`;

    document.documentElement.style.setProperty('--accent-color', accentColor);

    const color1 = `rgb(${palette[0][0]}, ${palette[0][1]}, ${palette[0][2]})`;
    const color2 = `rgb(${palette[1][0]}, ${palette[1][1]}, ${palette[1][2]})`;
    const gradient = `linear-gradient(to bottom right, ${color1}, ${color2})`;
    
    inactiveEl.style.background = gradient;
    activeEl.style.opacity = '0';
    inactiveEl.style.opacity = '1';
  };
}
function setCover(pic) {
  if (!pic) {
    cover.classList.add('hidden'); coverPh.classList.remove('hidden');
    setCoverGradient('');
    return;
  }
  let base64 = '';
  const data = pic.data;
  for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i]);
  const src = `data:${pic.format};base64,${btoa(base64)}`;
  cover.src = src;
  cover.classList.remove('hidden'); coverPh.classList.add('hidden');
  setCoverGradient(src);
}

// === UPCOMING LIST & ANIMATION FUNCTIONS ===
function updateViewportHeightAndFade() {
  const itemH = 32;
  const itemCount = Math.min(Math.max(0, playlist.length - 1), VISIBLE);
  upcomingViewport.style.height = `${itemCount * itemH}px`;
  if (itemCount <= 1) {
    upcomingViewport.style.maskImage = 'none'; upcomingViewport.style.webkitMaskImage = 'none';
  } else {
    const fadeStartPercentage = ((itemCount - 1.5) / itemCount) * 100;
    const gradient = `linear-gradient(to bottom, black ${fadeStartPercentage}%, transparent 100%)`;
    upcomingViewport.style.maskImage = gradient; upcomingViewport.style.webkitMaskImage = gradient;
  }
}
function renderUpcomingRaw() {
  upcomingList.innerHTML = '';

  if (playlist.length <= 1) {
    noUpcomingMessage.classList.remove('hidden');
    return;
  }

  noUpcomingMessage.classList.add('hidden');

  const sourcePlaylist = isShuffle ? shuffledPlaylist : playlist;
  const currentlyPlayingSrc = playlist[currentTrack].src;
  const startIndex = sourcePlaylist.findIndex(track => track.src === currentlyPlayingSrc);

  if (startIndex === -1) return;

  const totalNeeded = VISIBLE + BUFFER;

  for (let i = 1; i <= totalNeeded; i++) {
    const trackIndexInSource = (startIndex + i) % sourcePlaylist.length;
    const track = sourcePlaylist[trackIndexInSource];
    const originalIndex = playlist.findIndex(t => t.src === track.src);

    const li = document.createElement('div');
    li.className = 'upcoming-item';
    li.dataset.idx = originalIndex;
    li.textContent = `${track.title} — ${track.artist || ''}`;
    upcomingList.appendChild(li);
  }
}
function updateUpcoming() {
  updateViewportHeightAndFade();
  renderUpcomingRaw();
  upcomingList.style.transition = 'none';
  upcomingList.style.transform = 'translateY(0)';
  void upcomingList.offsetHeight;
}
function updateAndAnimateUpcoming() {
  upcomingList.style.opacity = '0';
  setTimeout(() => {
    updateUpcoming();
    upcomingList.style.opacity = '1';
  }, 300);
}
function animateUpcomingForward() {
  return new Promise(resolve => {
    if (animating || playlist.length <= 1) return resolve();
    renderUpcomingRaw();
    const firstItem = upcomingList.querySelector('.upcoming-item');
    if (!firstItem) return resolve();
    const itemH = firstItem.getBoundingClientRect().height || 32;
    animating = true;
    upcomingList.style.transition = `transform var(--transition-dur) ease`;
    requestAnimationFrame(() => (upcomingList.style.transform = `translateY(-${itemH}px)`));
    upcomingList.addEventListener('transitionend', function onEnd(e) {
      if (e.target !== upcomingList) return;
      upcomingList.removeEventListener('transitionend', onEnd);
      upcomingList.style.transition = 'none';
      upcomingList.style.transform = 'translateY(0)';
      requestAnimationFrame(() => {
        animating = false;
        resolve();
      });
    });
  });
}
function animateUpcomingBackward() {
  return new Promise(resolve => {
    if (animating || playlist.length <= 1) return resolve();
    const firstItem = upcomingList.querySelector('.upcoming-item');
    if (!firstItem) return resolve();
    const itemH = firstItem.getBoundingClientRect().height || 32;
    animating = true;
    const newFirstIndex = currentTrack;
    const li = document.createElement('div');
    li.className = 'upcoming-item';
    li.dataset.idx = newFirstIndex;
    li.textContent = `${playlist[newFirstIndex].title} — ${playlist[newFirstIndex].artist || ''}`;
    upcomingList.prepend(li);
    upcomingList.style.transition = 'none';
    upcomingList.style.transform = `translateY(-${itemH}px)`;
    requestAnimationFrame(() => {
      upcomingList.style.transition = `transform var(--transition-dur) ease`;
      upcomingList.style.transform = 'translateY(0)';
    });
    upcomingList.addEventListener('transitionend', function onEnd(e) {
      if (e.target !== upcomingList) return;
      upcomingList.removeEventListener('transitionend', onEnd);
      animating = false;
      resolve();
    });
  });
}

// === SHUFFLE & REMOVAL FUNCTIONS ===
function shuffleArray(array) {
  let a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function toggleShuffle() {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle('active-shuffle', isShuffle);
  if (isShuffle && playlist.length > 0) {
    shuffledPlaylist = shuffleArray(playlist);
    const currentlyPlaying = playlist[currentTrack];
    const currentIndexInShuffled = shuffledPlaylist.findIndex(track => track.src === currentlyPlaying.src);
    if (currentIndexInShuffled > -1) {
      const [item] = shuffledPlaylist.splice(currentIndexInShuffled, 1);
      shuffledPlaylist.unshift(item);
    }
  } else {
    shuffledPlaylist = [];
  }
  updateAndAnimateUpcoming();
}
function getNextTrackIndex() {
  if (!isShuffle) {
    return (currentTrack + 1) % playlist.length;
  }
  if (playlist.length <= 1) return 0;
  const currentlyPlayingSrc = playlist[currentTrack].src;
  const currentIndexInShuffled = shuffledPlaylist.findIndex(track => track.src === currentlyPlayingSrc);
  let nextIndexInShuffled = currentIndexInShuffled + 1;
  if (nextIndexInShuffled >= shuffledPlaylist.length) {
    shuffledPlaylist = shuffleArray(playlist);
    if (shuffledPlaylist[0].src === currentlyPlayingSrc && shuffledPlaylist.length > 1) {
      [shuffledPlaylist[0], shuffledPlaylist[1]] = [shuffledPlaylist[1], shuffledPlaylist[0]];
    }
    nextIndexInShuffled = 0;
  }
  const nextTrackSrc = shuffledPlaylist[nextIndexInShuffled].src;
  return playlist.findIndex(track => track.src === nextTrackSrc);
}
function removeCurrentTrack() {
  if (playlist.length === 0) return;
  const trackToRemove = playlist[currentTrack];
  playlist.splice(currentTrack, 1);
  URL.revokeObjectURL(trackToRemove.src);
  if (isShuffle) {
    const indexInShuffled = shuffledPlaylist.findIndex(t => t.src === trackToRemove.src);
    if (indexInShuffled > -1) {
      shuffledPlaylist.splice(indexInShuffled, 1);
    }
  }
  if (playlist.length === 0) {
    activeAudio.pause(); activeAudio.src = '';
    standbyAudio.src = '';
    titleEl.textContent = 'No track loaded'; artistEl.textContent = '';
    playBtn.textContent = 'Play';
    setCover(null); trackCountEl.textContent = '';
    updateUpcoming(); removeTrackBtn.style.display = 'none';
    lastGradientSrc = null;
    return;
  }
  if (currentTrack >= playlist.length) {
    currentTrack = 0;
  }
  playTrack(currentTrack);
  trackCountEl.textContent = `${currentTrack + 1} / ${playlist.length}`;
  updateUpcoming();
}

// === PLAYBACK LOGIC ===
function preloadNextTrack() {
  if (hasPreloaded || playlist.length < 2) return;
  
  const nextIndex = getNextTrackIndex();
  const nextTrack = playlist[nextIndex];
  if (!nextTrack) return;
  
  standbyAudio.src = nextTrack.src;
  standbyAudio.load();
  hasPreloaded = true;
}

function playTrack(index) {
  const clamped = ((index % playlist.length) + playlist.length) % playlist.length;
  const track = playlist[clamped];
  if (!track) return;

  currentTrack = clamped;
  hasPreloaded = false;

  activeAudio.src = track.src;
  activeAudio.load();
  activeAudio.play().then(() => {
    playBtn.textContent = 'Pause';

    preloadNextTrack();
  }).catch(() => {
    playBtn.textContent = 'Play';
  });

  standbyAudio.src = '';

  titleEl.textContent = track.title;
  artistEl.textContent = track.artist || '';
  setCover(track.picture);
  removeTrackBtn.style.display = 'flex';
  trackCountEl.textContent = `${currentTrack + 1} / ${playlist.length}`;
  updateUpcoming();
}

function setAndPlayTrack(index) {
  playTrack(index);
}

// === FILE INPUT ===
fileInp.addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const replace = document.getElementById('replacePlaylist').checked;
  const wasPlaylistEmpty = playlist.length === 0;
  if (replace) {
    playlist.forEach(p => URL.revokeObjectURL(p.src));
    playlist = []; currentTrack = 0; activeAudio.src = ''; standbyAudio.src = '';
    titleEl.textContent = 'No track loaded'; artistEl.textContent = '';
    cover.classList.add('hidden'); coverPh.classList.remove('hidden');
    trackCountEl.textContent = ''; removeTrackBtn.style.display = 'none';
    lastGradientSrc = null; updateUpcoming();
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    let metaTitle = file.name; let metaArtist = ''; let metaPicture = null;
    if (window.jsmediatags) {
      await new Promise(res => {
        jsmediatags.read(file, {
          onSuccess: ({ tags }) => {
            if (tags.title) metaTitle = tags.title;
            if (tags.artist) metaArtist = tags.artist;
            if (tags.picture) metaPicture = tags.picture;
            res();
          },
          onError: () => res()
        });
      });
    } else {
      libWarn.classList.remove('hidden');
    }
    playlist.push({ src: url, title: metaTitle, artist: metaArtist, picture: metaPicture });
  }
  if (isShuffle) {
    shuffledPlaylist = shuffleArray(playlist);
  }
  if (replace || wasPlaylistEmpty) {
    setAndPlayTrack(0);
  } else {
    updateUpcoming();
  }
});

// === CONTROLS & EVENT LISTENERS ===
shuffleBtn.addEventListener('click', toggleShuffle);
removeTrackBtn.addEventListener('click', removeCurrentTrack);

playBtn.addEventListener('click', () => {
  if (!activeAudio.src) return;
  if (activeAudio.paused) {
    activeAudio.play();
    playBtn.textContent = 'Pause';
  } else {
    activeAudio.pause();
    playBtn.textContent = 'Play';
  }
});

prevBtn.addEventListener('click', () => {
  if (!playlist.length || animating) return;
  const newIndex = (currentTrack - 1 + playlist.length) % playlist.length;
  animateUpcomingBackward().then(() => {
    playTrack(newIndex);
  });
});

nextBtn.addEventListener('click', () => {
  if (!playlist.length || animating) return;
  const newIndex = getNextTrackIndex();
  animateUpcomingForward().then(() => {
    playTrack(newIndex);
  });
});

[audio, audioNext].forEach(audioEl => {
  audioEl.addEventListener('ended', () => {
    if (!hasPreloaded || !standbyAudio.src) {

      const newIndex = getNextTrackIndex();
      playTrack(newIndex);
      return;
    }
  
    const nextIndex = getNextTrackIndex();
    currentTrack = nextIndex;
    hasPreloaded = false;
  
    standbyAudio.play().then(() => {
      playBtn.textContent = 'Pause';
    });
  
    [activeAudio, standbyAudio] = [standbyAudio, activeAudio];

    const newTrack = playlist[currentTrack];
    titleEl.textContent = newTrack.title;
    artistEl.textContent = newTrack.artist || '';
    setCover(newTrack.picture);
    trackCountEl.textContent = `${currentTrack + 1} / ${playlist.length}`;
    updateUpcoming();

    preloadNextTrack();
  });
  
  audioEl.addEventListener('timeupdate', () => {
    if (audioEl !== activeAudio) return;
  
    if (activeAudio.duration && (activeAudio.duration - activeAudio.currentTime < PRELOAD_TIME)) {
      preloadNextTrack();
    }

    if (!isSeeking && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0) {
      seek.value = (activeAudio.currentTime / activeAudio.duration) * 100;
    } else if (!isSeeking) {
      seek.value = 0;
    }
    curEl.textContent = fmt(activeAudio.currentTime);
    durEl.textContent = fmt(activeAudio.duration);
  });
  
  audioEl.addEventListener('loadedmetadata', () => {
    if (audioEl === activeAudio) {
      durEl.textContent = fmt(activeAudio.duration);
    }
  });
});


seek.addEventListener('mousedown', () => { isSeeking = true; });
seek.addEventListener('change', () => {
  if (Number.isFinite(activeAudio.duration)) {
    activeAudio.currentTime = (seek.value / 100) * activeAudio.duration;
  }
  isSeeking = false;
});

updateUpcoming();
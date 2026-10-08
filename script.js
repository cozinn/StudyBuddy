/* StudyBuddy: a small, self-contained study dashboard. All saved data lives in localStorage. */
const STORAGE_KEY = 'studybuddy-data-v1';
const DEFAULT_SUBJECTS = ['Mathematics', 'Science', 'English', 'Filipino', 'ICT'];
const QUOTES = [
  { text: 'You don’t have to be perfect to make progress.', author: 'A gentle reminder' },
  { text: 'Small steps every day lead to big changes.', author: 'Your future self' },
  { text: 'Believe you can, and you’re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'It always seems impossible until it’s done.', author: 'Nelson Mandela' },
  { text: 'You are capable of more than you know.', author: 'A little encouragement' },
  { text: 'Progress, not perfection. Keep going.', author: 'Your StudyBuddy' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' }
];
const ICONS = ['📐', '🔬', '📖', '✍️', '💻', '🌿', '⭐', '🎨', '🌎', '🎵'];

function makeId() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      return {
        subjects: Array.isArray(saved.subjects) ? saved.subjects : [...DEFAULT_SUBJECTS],
        tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
        cards: Array.isArray(saved.cards) ? saved.cards : [],
        quizzes: Array.isArray(saved.quizzes) ? saved.quizzes : [],
        notes: Array.isArray(saved.notes) ? saved.notes : [],
        scores: Array.isArray(saved.scores) ? saved.scores : [],
        focusMinutes: Number(saved.focusMinutes) || 0,
        focusSessions: Array.isArray(saved.focusSessions) ? saved.focusSessions : [],
        darkMode: Boolean(saved.darkMode)
      };
    }
  } catch (error) {
    console.warn('StudyBuddy could not read saved data. Starting fresh.', error);
  }
  return { subjects: [...DEFAULT_SUBJECTS], tasks: [], cards: [], quizzes: [], notes: [], scores: [], focusMinutes: 0, focusSessions: [], darkMode: false };
}
let data = loadData();
let editingTaskId = null;
let editingCardId = null;
let editingNoteId = null;
let draftQuestions = [];
let quoteIndex = -1;
let toastTimeout;
let timerMode = 'focus';
let timerDurations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
let timerRemaining = timerDurations.focus;
let timerInterval = null;
let timerRunning = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    showToast('Your browser could not save this change. Check available storage.');
    console.error('StudyBuddy save failed:', error);
  }
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
}
function formatDate(dateString) {
  if (!dateString) return 'No deadline';
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
function dateToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function getTodaySessions() {
  return data.focusSessions.filter(session => new Date(session.date).toDateString() === new Date().toDateString()).length;
}

// Navigation swaps views without needing a server or a page reload.
function openView(name) {
  const target = $(`#${name}-view`);
  if (!target) return;
  $$('.view').forEach(view => view.classList.toggle('active', view === target));
  $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === name));
  const activeLink = $(`.nav-link[data-view="${name}"]`);
  $('#current-page').textContent = activeLink ? activeLink.textContent.trim() : 'Dashboard';
  $('#sidebar').classList.remove('open');
  $('#mobile-menu').setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function bindNavigation() {
  $$('.nav-link').forEach(button => button.addEventListener('click', () => openView(button.dataset.view)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => openView(button.dataset.go)));
  $('#mobile-menu').addEventListener('click', () => {
    const isOpen = $('#sidebar').classList.toggle('open');
    $('#mobile-menu').setAttribute('aria-expanded', String(isOpen));
  });
  document.addEventListener('click', event => {
    if (window.innerWidth <= 800 && $('#sidebar').classList.contains('open') && !$('#sidebar').contains(event.target) && !$('#mobile-menu').contains(event.target)) {
      $('#sidebar').classList.remove('open');
      $('#mobile-menu').setAttribute('aria-expanded', 'false');
    }
  });
}

function fillSubjectSelects() {
  const selects = ['#task-subject', '#card-subject', '#quiz-subject', '#note-subject'];
  selects.forEach(selector => {
    const select = $(selector);
    const current = select.value;
    select.innerHTML = data.subjects.map(subject => `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`).join('');
    if (data.subjects.includes(current)) select.value = current;
  });
  const filter = $('#card-filter');
  const oldFilter = filter.value || 'all';
  filter.innerHTML = '<option value="all">All subjects</option>' + data.subjects.map(subject => `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`).join('');
  filter.value = data.subjects.includes(oldFilter) ? oldFilter : 'all';
}
function renderDashboard() {
  const completed = data.tasks.filter(task => task.done).length;
  const totalTasks = data.tasks.length;
  const taskPercent = totalTasks ? Math.round(completed / totalTasks * 100) : 0;
  const average = data.scores.length ? Math.round(data.scores.reduce((sum, score) => sum + score.percent, 0) / data.scores.length) : null;
  $('#dash-tasks').textContent = completed;
  $('#dash-task-bar').style.width = `${taskPercent}%`;
  $('#dash-task-caption').textContent = totalTasks ? `${taskPercent}% of your planned tasks complete` : 'A fresh start is a great start';
  $('#dash-focus').textContent = data.focusMinutes;
  $('#dash-focus-bar').style.width = `${Math.min(100, data.focusMinutes / 120 * 100)}%`;
  $('#dash-quiz').textContent = average === null ? '—' : average;
  $('#dash-quiz-unit').textContent = average === null ? '' : '%';
  $('#dash-quiz-bar').style.width = `${average || 0}%`;
  $('#dash-quiz-caption').textContent = average === null ? 'Take a quiz to see your score' : `${data.scores.length} quiz ${data.scores.length === 1 ? 'attempt' : 'attempts'} completed`;
  const upcoming = data.tasks.filter(task => !task.done).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 4);
  const container = $('#dashboard-tasks');
  if (!upcoming.length) {
    container.innerHTML = `<div class="empty-state"><span>🌼</span>${totalTasks ? 'All caught up! Lovely work.' : 'Your checklist is waiting for its first task.'}</div>`;
  } else {
    container.innerHTML = upcoming.map(task => `<div class="task-preview"><span class="task-dot"></span><div class="task-preview-copy"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.subject || 'No subject')}${task.deadline ? ` · ${formatDate(task.deadline)}` : ''}</small></div></div>`).join('');
  }
}
function renderTasks() {
  const filter = $('#task-filter').value;
  const filtered = data.tasks.filter(task => filter === 'all' || (filter === 'done' ? task.done : !task.done)).sort((a, b) => Number(a.done) - Number(b.done) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  $('#task-count').textContent = data.tasks.length;
  const list = $('#task-list');
  if (!filtered.length) {
    const message = data.tasks.length ? 'Nothing in this list right now.' : 'No tasks yet. Add a small goal above to get started.';
    list.innerHTML = `<div class="panel empty-state"><span>🪴</span>${message}</div>`;
    return;
  }
  list.innerHTML = filtered.map(task => {
    const overdue = task.deadline && task.deadline < dateToday() && !task.done;
    return `<article class="task-row ${task.done ? 'done' : ''}"><input class="task-check" type="checkbox" data-action="task-toggle" data-id="${escapeHTML(task.id)}" aria-label="Mark ${escapeHTML(task.title)} ${task.done ? 'not completed' : 'completed'}" ${task.done ? 'checked' : ''}><div class="task-main"><strong>${escapeHTML(task.title)}<span class="subject-tag">${escapeHTML(task.subject || 'No subject')}</span></strong><small>${task.deadline ? `Due ${formatDate(task.deadline)}` : 'No deadline set'}</small></div><span class="task-deadline ${overdue ? 'overdue' : ''}">${overdue ? 'Overdue' : task.deadline ? formatDate(task.deadline) : ''}</span><div class="row-actions"><button class="small-action" data-action="task-edit" data-id="${escapeHTML(task.id)}" aria-label="Edit ${escapeHTML(task.title)}" type="button">✎</button><button class="small-action" data-action="task-delete" data-id="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}" type="button">×</button></div></article>`;
  }).join('');
}
function resetTaskForm() {
  editingTaskId = null;
  $('#task-form').reset();
  $('#task-form-title').textContent = 'Add a task';
  $('#task-submit').innerHTML = 'Add task <span>＋</span>';
  $('#task-cancel').classList.add('hidden');
}
$('#task-form').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('#task-title').value.trim();
  if (!title) return showToast('Add a name for your task first.');
  const taskData = { title, subject: $('#task-subject').value, deadline: $('#task-deadline').value };
  if (editingTaskId) {
    const task = data.tasks.find(item => item.id === editingTaskId);
    if (task) Object.assign(task, taskData);
    showToast('Task updated — nice and tidy!');
  } else {
    data.tasks.push({ id: makeId(), ...taskData, done: false, createdAt: new Date().toISOString() });
    showToast('Task added to your planner!');
  }
  saveData(); resetTaskForm(); renderAll();
});
$('#task-cancel').addEventListener('click', resetTaskForm);
$('#task-filter').addEventListener('change', renderTasks);
$('#task-list').addEventListener('change', event => {
  const checkbox = event.target.closest('[data-action="task-toggle"]');
  if (!checkbox) return;
  const task = data.tasks.find(item => item.id === checkbox.dataset.id);
  if (!task) return;
  task.done = checkbox.checked;
  saveData(); renderAll(); showToast(task.done ? 'Task checked off. Great work! ✨' : 'Task moved back to your to-do list.');
});
$('#task-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const task = data.tasks.find(item => item.id === button.dataset.id);
  if (!task) return;
  if (button.dataset.action === 'task-edit') {
    editingTaskId = task.id;
    $('#task-title').value = task.title;
    $('#task-subject').value = data.subjects.includes(task.subject) ? task.subject : data.subjects[0] || '';
    $('#task-deadline').value = task.deadline || '';
    $('#task-form-title').textContent = 'Edit your task';
    $('#task-submit').innerHTML = 'Save changes <span>✓</span>';
    $('#task-cancel').classList.remove('hidden');
    $('#task-title').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (button.dataset.action === 'task-delete' && confirm(`Delete “${task.title}”?`)) {
    data.tasks = data.tasks.filter(item => item.id !== task.id);
    saveData(); renderAll(); showToast('Task deleted.');
  }
});

function renderCards() {
  const subjectFilter = $('#card-filter').value;
  const cards = data.cards.filter(card => subjectFilter === 'all' || card.subject === subjectFilter);
  $('#card-count').textContent = data.cards.length;
  const list = $('#flashcard-list');
  if (!cards.length) {
    list.innerHTML = `<div class="panel empty-state" style="grid-column:1/-1"><span>🪄</span>${data.cards.length ? 'No cards in this subject yet.' : 'Your deck is empty. Create your first flashcard above.'}</div>`;
    return;
  }
  list.innerHTML = cards.map(card => `<article class="flashcard ${escapeHTML(card.color || 'lilac')}" data-card-id="${escapeHTML(card.id)}"><div class="flashcard-top"><span class="subject-tag">${escapeHTML(card.subject)}</span><div class="flashcard-actions"><button class="small-action" data-action="card-edit" aria-label="Edit flashcard" type="button">✎</button><button class="small-action" data-action="card-delete" aria-label="Delete flashcard" type="button">×</button></div></div><div class="flashcard-content" role="button" tabindex="0" aria-label="Flip flashcard">${escapeHTML(card.front)}<small>Tap to flip</small></div><div class="flashcard-bottom">${escapeHTML(card.subject)} · tap card to reveal</div></article>`).join('');
}
function resetCardForm() {
  editingCardId = null; $('#card-form').reset(); $('#card-form-title').textContent = 'Create a flashcard'; $('#card-submit').innerHTML = 'Save flashcard <span>＋</span>'; $('#card-cancel').classList.add('hidden');
}
$('#card-form').addEventListener('submit', event => {
  event.preventDefault();
  const front = $('#card-front').value.trim(); const back = $('#card-back').value.trim();
  if (!front || !back) return showToast('Add both the front and back of your card.');
  const card = { front, back, subject: $('#card-subject').value, color: $('#card-color').value };
  if (editingCardId) { Object.assign(data.cards.find(item => item.id === editingCardId), card); showToast('Flashcard updated!'); }
  else { data.cards.unshift({ id: makeId(), ...card }); showToast('Flashcard saved to your deck!'); }
  saveData(); resetCardForm(); renderAll();
});
$('#card-cancel').addEventListener('click', resetCardForm);
$('#card-filter').addEventListener('change', renderCards);
function flipCard(cardElement) {
  const card = data.cards.find(item => item.id === cardElement.dataset.cardId);
  if (!card) return;
  const content = $('.flashcard-content', cardElement);
  const flipped = cardElement.classList.toggle('flipped');
  content.innerHTML = `${escapeHTML(flipped ? card.back : card.front)}<small>${flipped ? 'Answer · tap to see question' : 'Tap to flip'}</small>`;
  $('.flashcard-bottom', cardElement).textContent = flipped ? 'Answer revealed · nice work!' : `${card.subject} · tap card to reveal`;
}
$('#flashcard-list').addEventListener('click', event => {
  const cardElement = event.target.closest('.flashcard'); if (!cardElement) return;
  const action = event.target.closest('[data-action]')?.dataset.action;
  const card = data.cards.find(item => item.id === cardElement.dataset.cardId); if (!card) return;
  if (!action) { flipCard(cardElement); return; }
  if (action === 'card-edit') {
    editingCardId = card.id; $('#card-subject').value = data.subjects.includes(card.subject) ? card.subject : data.subjects[0] || ''; $('#card-color').value = card.color || 'lilac'; $('#card-front').value = card.front; $('#card-back').value = card.back; $('#card-form-title').textContent = 'Edit flashcard'; $('#card-submit').innerHTML = 'Save changes <span>✓</span>'; $('#card-cancel').classList.remove('hidden'); $('#card-front').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'card-delete' && confirm('Delete this flashcard?')) { data.cards = data.cards.filter(item => item.id !== card.id); saveData(); renderAll(); showToast('Flashcard deleted.'); }
});
$('#flashcard-list').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('flashcard-content')) { event.preventDefault(); flipCard(event.target.closest('.flashcard')); } });

function renderDraftQuestions() {
  $('#quiz-draft-list').innerHTML = draftQuestions.length ? `<strong class="draft-chip">${draftQuestions.length} question${draftQuestions.length === 1 ? '' : 's'} ready</strong>${draftQuestions.map((q, index) => `<span class="draft-chip">${index + 1}. ${escapeHTML(q.question.slice(0, 38))}${q.question.length > 38 ? '…' : ''}</span>`).join('')}` : '';
}
function readQuestionFromForm() {
  const title = $('#quiz-title').value.trim();
  const question = $('#quiz-question').value.trim();
  const options = [0, 1, 2, 3].map(index => $(`#quiz-option-${index}`).value.trim());
  if (!title) { $('#quiz-title').focus(); showToast('Give your quiz a title before adding questions.'); return null; }
  if (!question || options.some(option => !option)) { $('#quiz-question-form').reportValidity(); showToast('Fill in the question and all four answer choices.'); return null; }
  return { question, options, correct: Number($('#quiz-correct').value) };
}
$('#add-question').addEventListener('click', () => {
  const question = readQuestionFromForm(); if (!question) return;
  draftQuestions.push(question);
  $('#quiz-question').value = ''; [0, 1, 2, 3].forEach(index => { $(`#quiz-option-${index}`).value = ''; }); $('#quiz-question').focus(); renderDraftQuestions(); showToast(`Question ${draftQuestions.length} added to your quiz.`);
});
$('#quiz-question-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('#quiz-title').value.trim()) return showToast('Give your quiz a title.');
  if (draftQuestions.length === 0) {
    const finalQuestion = readQuestionFromForm();
    if (!finalQuestion) return;
    draftQuestions.push(finalQuestion);
  } else if ($('#quiz-question').value.trim() || [0, 1, 2, 3].some(index => $(`#quiz-option-${index}`).value.trim())) {
    const finalQuestion = readQuestionFromForm(); if (!finalQuestion) return; draftQuestions.push(finalQuestion);
  }
  const quiz = { id: makeId(), title: $('#quiz-title').value.trim(), subject: $('#quiz-subject').value, questions: draftQuestions, createdAt: new Date().toISOString() };
  data.quizzes.unshift(quiz); draftQuestions = []; saveData(); $('#quiz-question-form').reset(); renderDraftQuestions(); renderAll(); showToast('Quiz saved — ready when you are!');
});
function renderQuizzes() {
  $('#quiz-count').textContent = data.quizzes.length;
  const list = $('#quiz-list');
  if (!data.quizzes.length) { list.innerHTML = '<div class="panel empty-state" style="grid-column:1/-1"><span>🧠</span>No quizzes yet. Build your first one above!</div>'; return; }
  list.innerHTML = data.quizzes.map(quiz => {
    const attempts = data.scores.filter(score => score.quizId === quiz.id);
    const best = attempts.length ? Math.max(...attempts.map(score => score.percent)) : null;
    return `<article class="quiz-card"><div class="quiz-card-head"><div><h3>${escapeHTML(quiz.title)}</h3><p>${escapeHTML(quiz.subject)}</p></div><button class="small-action" data-action="quiz-delete" data-id="${escapeHTML(quiz.id)}" aria-label="Delete ${escapeHTML(quiz.title)}" type="button">×</button></div><div class="quiz-card-meta"><span>✎ ${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'}</span><span>${attempts.length} attempt${attempts.length === 1 ? '' : 's'}</span>${best !== null ? `<span class="quiz-best">Best ${best}%</span>` : ''}</div><button class="button button-soft" data-action="quiz-start" data-id="${escapeHTML(quiz.id)}" type="button">Take this quiz <span>→</span></button></article>`;
  }).join('');
}
function showQuizPlayer(quiz) {
  const player = $('#quiz-player');
  player.classList.remove('hidden'); player.dataset.quizId = quiz.id;
  player.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">YOUR TURN</span><h2>${escapeHTML(quiz.title)}</h2><p>${escapeHTML(quiz.subject)} · ${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'}</p></div><button class="icon-button" id="close-quiz" type="button" aria-label="Close quiz">×</button></div><form id="quiz-answer-form">${quiz.questions.map((question, index) => `<fieldset class="quiz-play-question"><legend class="hidden">Question ${index + 1}</legend><strong>${index + 1}. ${escapeHTML(question.question)}</strong>${question.options.map((option, optionIndex) => `<label class="quiz-option"><input type="radio" name="answer-${index}" value="${optionIndex}" required><span>${String.fromCharCode(65 + optionIndex)}. ${escapeHTML(option)}</span></label>`).join('')}</fieldset>`).join('')}<div class="quiz-play-actions"><button class="button button-primary" type="submit">Check my answers <span>✓</span></button><button class="button button-ghost" id="cancel-quiz" type="button">Cancel</button></div></form><div id="quiz-result" class="quiz-answer-state" aria-live="polite"></div>`;
  player.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#quiz-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const quiz = data.quizzes.find(item => item.id === button.dataset.id); if (!quiz) return;
  if (button.dataset.action === 'quiz-start') showQuizPlayer(quiz);
  if (button.dataset.action === 'quiz-delete' && confirm(`Delete the quiz “${quiz.title}” and its saved score history?`)) {
    data.quizzes = data.quizzes.filter(item => item.id !== quiz.id); data.scores = data.scores.filter(score => score.quizId !== quiz.id); saveData(); renderAll(); $('#quiz-player').classList.add('hidden'); showToast('Quiz deleted.');
  }
});
$('#quiz-player').addEventListener('click', event => {
  if (event.target.id === 'close-quiz' || event.target.id === 'cancel-quiz') { $('#quiz-player').classList.add('hidden'); $('#quiz-player').innerHTML = ''; }
});
$('#quiz-player').addEventListener('submit', event => {
  if (event.target.id !== 'quiz-answer-form') return;
  event.preventDefault();
  const quiz = data.quizzes.find(item => item.id === $('#quiz-player').dataset.quizId); if (!quiz) return;
  const formData = new FormData(event.target);
  let correctCount = 0;
  quiz.questions.forEach((question, index) => { if (Number(formData.get(`answer-${index}`)) === Number(question.correct)) correctCount++; });
  const percent = Math.round(correctCount / quiz.questions.length * 100);
  const score = { id: makeId(), quizId: quiz.id, title: quiz.title, subject: quiz.subject, correct: correctCount, total: quiz.questions.length, percent, date: new Date().toISOString() };
  data.scores.unshift(score); saveData();
  const result = $('#quiz-result'); result.className = `quiz-answer-state ${percent >= 60 ? 'correct' : 'incorrect'}`; result.textContent = percent === 100 ? `Perfect score! ${correctCount} out of ${quiz.questions.length} — amazing work!` : `You got ${correctCount} out of ${quiz.questions.length} (${percent}%). ${percent >= 60 ? 'Lovely work!' : 'A little more practice will help!'}`;
  event.target.querySelectorAll('input').forEach(input => { input.disabled = true; });
  event.target.querySelector('button[type="submit"]').disabled = true;
  renderAll(); showToast(`Quiz finished: ${percent}%`);
});

function resetNoteForm() { editingNoteId = null; $('#note-form').reset(); $('#note-form-title').textContent = 'Write a note'; $('#note-submit').innerHTML = 'Save note <span>✓</span>'; $('#note-cancel').classList.add('hidden'); }
$('#note-form').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('#note-title').value.trim(); const content = $('#note-content').value.trim();
  if (!title || !content) return showToast('Add a title and some note text before saving.');
  const note = { title, content, subject: $('#note-subject').value, updatedAt: new Date().toISOString() };
  if (editingNoteId) { Object.assign(data.notes.find(item => item.id === editingNoteId), note); showToast('Note updated and saved.'); }
  else { data.notes.unshift({ id: makeId(), ...note }); showToast('Note saved to your notebook!'); }
  saveData(); resetNoteForm(); renderAll();
});
$('#note-cancel').addEventListener('click', resetNoteForm);
$('#note-search').addEventListener('input', renderNotes);
function renderNotes() {
  const query = $('#note-search').value.trim().toLowerCase();
  const notes = data.notes.filter(note => `${note.title} ${note.content} ${note.subject}`.toLowerCase().includes(query));
  $('#note-count').textContent = data.notes.length;
  const list = $('#notes-list');
  if (!notes.length) { list.innerHTML = `<div class="panel empty-state" style="grid-column:1/-1"><span>📝</span>${data.notes.length ? 'No notes match that search.' : 'Your notebook is empty. Save your first note above.'}</div>`; return; }
  list.innerHTML = notes.map(note => `<article class="note-card"><div class="note-card-head"><div><h3>${escapeHTML(note.title)}</h3><p>${escapeHTML(note.subject)}</p></div><div class="row-actions"><button class="small-action" data-action="note-edit" data-id="${escapeHTML(note.id)}" aria-label="Edit ${escapeHTML(note.title)}" type="button">✎</button><button class="small-action" data-action="note-delete" data-id="${escapeHTML(note.id)}" aria-label="Delete ${escapeHTML(note.title)}" type="button">×</button></div></div><div class="note-card-content">${escapeHTML(note.content)}</div><div class="note-card-foot"><small>Updated ${new Date(note.updatedAt || Date.now()).toLocaleDateString()}</small><span class="subject-tag">${escapeHTML(note.subject)}</span></div></article>`).join('');
}
$('#notes-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const note = data.notes.find(item => item.id === button.dataset.id); if (!note) return;
  if (button.dataset.action === 'note-edit') {
    editingNoteId = note.id; $('#note-title').value = note.title; $('#note-content').value = note.content; $('#note-subject').value = data.subjects.includes(note.subject) ? note.subject : data.subjects[0] || ''; $('#note-form-title').textContent = 'Edit your note'; $('#note-submit').innerHTML = 'Save changes <span>✓</span>'; $('#note-cancel').classList.remove('hidden'); $('#note-title').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (button.dataset.action === 'note-delete' && confirm(`Delete the note “${note.title}”?`)) { data.notes = data.notes.filter(item => item.id !== note.id); saveData(); renderAll(); showToast('Note deleted.'); }
});

function renderSubjects() {
  $('#subject-count').textContent = data.subjects.length;
  const list = $('#subject-list');
  if (!data.subjects.length) { list.innerHTML = '<div class="panel empty-state" style="grid-column:1/-1"><span>📚</span>No subjects yet. Add a class above to organize your study space.</div>'; return; }
  list.innerHTML = data.subjects.map((subject, index) => {
    const count = data.tasks.filter(task => task.subject === subject).length + data.cards.filter(card => card.subject === subject).length + data.notes.filter(note => note.subject === subject).length;
    return `<article class="subject-card"><span class="subject-card-icon">${ICONS[index % ICONS.length]}</span><button class="small-action" data-action="subject-delete" data-subject="${escapeHTML(subject)}" aria-label="Delete ${escapeHTML(subject)}" type="button">×</button><h3>${escapeHTML(subject)}</h3><p>${count} study item${count === 1 ? '' : 's'} · tasks, cards & notes</p></article>`;
  }).join('');
}
$('#subject-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#subject-name'); const name = input.value.trim();
  if (!name) return showToast('Type a subject name first.');
  if (data.subjects.some(subject => subject.toLowerCase() === name.toLowerCase())) { input.setCustomValidity('This subject already exists.'); input.reportValidity(); input.setCustomValidity(''); return; }
  data.subjects.push(name); saveData(); input.value = ''; renderAll(); showToast(`${name} added to your subjects!`);
});
$('#subject-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action="subject-delete"]'); if (!button) return;
  const subject = button.dataset.subject;
  const used = data.tasks.some(item => item.subject === subject) || data.cards.some(item => item.subject === subject) || data.notes.some(item => item.subject === subject) || data.quizzes.some(item => item.subject === subject);
  if (used) return showToast('Move or remove this subject’s study items before deleting it.');
  if (confirm(`Remove “${subject}” from your subjects?`)) { data.subjects = data.subjects.filter(item => item !== subject); saveData(); renderAll(); showToast('Subject removed.'); }
});

function renderProgress() {
  const done = data.tasks.filter(task => task.done).length;
  const total = data.tasks.length;
  $('#progress-tasks').textContent = done; $('#progress-total-tasks').textContent = total;
  $('#progress-task-bar').style.width = `${total ? done / total * 100 : 0}%`;
  $('#progress-focus').textContent = data.focusMinutes; $('#progress-focus-bar').style.width = `${Math.min(100, data.focusMinutes / 120 * 100)}%`;
  const average = data.scores.length ? Math.round(data.scores.reduce((sum, score) => sum + score.percent, 0) / data.scores.length) : null;
  $('#progress-quiz').textContent = average === null ? '—' : average; $('#progress-quiz-unit').textContent = average === null ? '' : '%';
  $('#progress-quiz-count').textContent = `${data.scores.length} quiz ${data.scores.length === 1 ? 'attempt' : 'attempts'} completed`;
  $('#progress-quiz-bar').style.width = `${average || 0}%`;
  const chart = $('#subject-chart');
  const taskCounts = data.subjects.map(subject => ({ subject, count: data.tasks.filter(task => task.subject === subject).length }));
  if (!taskCounts.some(item => item.count)) chart.innerHTML = '<div class="empty-state"><span>🌱</span>Complete or plan a task to see your subject mix.</div>';
  else {
    const max = Math.max(...taskCounts.map(item => item.count));
    chart.innerHTML = taskCounts.filter(item => item.count > 0).map(item => `<div class="chart-row"><span class="chart-name">${escapeHTML(item.subject)}</span><div class="chart-track" role="img" aria-label="${item.count} tasks for ${escapeHTML(item.subject)}"><div class="chart-fill" style="width:${Math.max(5, item.count / max * 100)}%"></div></div><span class="chart-value">${item.count}</span></div>`).join('');
  }
  const history = $('#score-history');
  if (!data.scores.length) history.innerHTML = '<div class="empty-state"><span>🌷</span>Your quiz scores will bloom here after your first attempt.</div>';
  else history.innerHTML = data.scores.slice(0, 6).map(score => `<div class="score-item"><div class="score-badge ${score.percent < 60 ? 'low' : ''}">${score.percent}%</div><div class="score-info"><strong>${escapeHTML(score.title)}</strong><small>${escapeHTML(score.subject)} · ${new Date(score.date).toLocaleDateString()}</small></div><small>${score.correct}/${score.total}</small></div>`).join('');
}

// The timer saves completed focus sessions only; breaks never inflate study time.
function renderTimer() {
  const minutes = Math.floor(timerRemaining / 60).toString().padStart(2, '0');
  const seconds = (timerRemaining % 60).toString().padStart(2, '0');
  $('#timer-display').textContent = `${minutes}:${seconds}`;
  const progress = timerDurations[timerMode] ? timerRemaining / timerDurations[timerMode] : 1;
  $('#timer-ring').style.background = `conic-gradient(var(--purple) ${(1 - progress) * 100}%, var(--line) 0)`;
  $('#timer-mode-label').textContent = timerMode === 'focus' ? 'TIME TO FOCUS' : timerMode === 'short' ? 'SHORT BREAK' : 'LONG BREAK';
  $('#timer-session').textContent = timerRunning ? 'You’re doing great — stay with it' : timerRemaining === 0 ? 'Session complete!' : timerMode === 'focus' ? 'Let’s make it count' : 'Take a little breather';
  $('#timer-start').textContent = timerRunning ? 'Pause' : timerRemaining === timerDurations[timerMode] ? (timerMode === 'focus' ? 'Start focus' : 'Start break') : 'Resume';
  $('#session-count').textContent = getTodaySessions();
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; timerRunning = false; }
function setTimerMode(mode) {
  stopTimer(); timerMode = mode; timerRemaining = timerDurations[mode];
  $$('.timer-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode)); renderTimer();
}
$$('.timer-tab').forEach(tab => tab.addEventListener('click', () => setTimerMode(tab.dataset.mode)));
$('#timer-start').addEventListener('click', () => {
  if (timerRunning) { stopTimer(); renderTimer(); return; }
  if (timerRemaining <= 0) timerRemaining = timerDurations[timerMode];
  timerRunning = true; renderTimer();
  timerInterval = setInterval(() => {
    timerRemaining--;
    if (timerRemaining <= 0) {
      stopTimer(); timerRemaining = 0;
      if (timerMode === 'focus') { data.focusMinutes += Math.round(timerDurations.focus / 60); data.focusSessions.push({ date: new Date().toISOString() }); saveData(); renderDashboard(); renderProgress(); showToast('Focus session complete! Take a well-earned break. 🎉'); }
      else showToast('Break time is over. Ready for another round?');
      renderAll();
    } else renderTimer();
  }, 1000);
});
$('#timer-reset').addEventListener('click', () => { stopTimer(); timerRemaining = timerDurations[timerMode]; renderTimer(); showToast('Timer reset.'); });

function renderMotivation() {
  let next = Math.floor(Math.random() * QUOTES.length);
  if (QUOTES.length > 1 && next === quoteIndex) next = (next + 1) % QUOTES.length;
  quoteIndex = next;
  $('#motivation-quote').textContent = `“${QUOTES[next].text}”`;
  $('#motivation-author').textContent = `— ${QUOTES[next].author}`;
}
$('#new-quote').addEventListener('click', renderMotivation);

function applyTheme() {
  document.body.classList.toggle('dark', data.darkMode);
  $('#theme-label').textContent = data.darkMode ? 'Light mode' : 'Dark mode';
  $('#theme-icon').textContent = data.darkMode ? '☀' : '☾';
  $('#theme-toggle').setAttribute('aria-label', data.darkMode ? 'Switch to light mode' : 'Switch to dark mode');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', data.darkMode ? '#191722' : '#f7f3ff');
}
$('#theme-toggle').addEventListener('click', () => { data.darkMode = !data.darkMode; saveData(); applyTheme(); });

function renderAll() {
  fillSubjectSelects(); renderDashboard(); renderTasks(); renderCards(); renderQuizzes(); renderNotes(); renderSubjects(); renderProgress(); renderTimer();
}
function initialize() {
  const today = new Date();
  $('#today-label').textContent = today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  applyTheme(); bindNavigation(); renderMotivation(); renderAll();
  // Ignore malformed legacy focus timestamps rather than letting them affect today's count.
  data.focusSessions = data.focusSessions.filter(session => session && !Number.isNaN(new Date(session.date).getTime()));
}
initialize();

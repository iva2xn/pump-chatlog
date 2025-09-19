export function initGuessWord(options = {}) {
  const ids = Object.assign({
    inputId: "targetWordInput",
    buttonId: "setWordBtn",
    currentWordId: "currentWord",
    winnerId: "winnerAddr",
    storageKey: "guessWord",
  }, options)

  let targetWord = null
  let totalGuesses = 0
  let winner = null

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function containsExactWord(text, word) {
    if (!text || !word) return false
    const re = new RegExp(`\\b${escapeRegExp(String(word).trim())}\\b`, "i")
    return re.test(String(text))
  }

  function setTargetWord(word) {
    targetWord = (word || "").trim() || null
    winner = null    
    if (winnerEl) winnerEl.textContent = "-"
    // Reset guesses whenever the target word changes
    totalGuesses = 0
    const el = document.getElementById(ids.currentWordId)
    if (el) el.textContent = targetWord ? `Current word: "${targetWord}"` : "No word set"
    try {
      if (targetWord) localStorage.setItem(ids.storageKey, targetWord)
      else localStorage.removeItem(ids.storageKey)
    } catch {}
    try { document.dispatchEvent(new CustomEvent("guess:totalChanged", { detail: { total: totalGuesses } })) } catch {}
  }

  // Wire UI
  const input = document.getElementById(ids.inputId)
  const btn = document.getElementById(ids.buttonId)
  const winnerEl = document.getElementById(ids.winnerId)

  try { targetWord = localStorage.getItem(ids.storageKey) || null } catch {}
  setTargetWord(targetWord)

  if (btn && input) {
    btn.addEventListener("click", () => setTargetWord(input.value))
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") setTargetWord(input.value) })
  }

  function checkMessage(msg) {
    try {
      if(winner) return false
      if (targetWord) {
        totalGuesses += 1
        try { document.dispatchEvent(new CustomEvent("guess:totalChanged", { detail: { total: totalGuesses } })) } catch {}
      }
      if (containsExactWord(msg?.message, targetWord)) {
        if (winnerEl) {
          winner = msg?.userAddress || "(unknown)"
          winnerEl.textContent = msg?.userAddress || "(unknown)"
        }
        return true
      }
    } catch {}
    return false
  }

  return { setTargetWord, containsExactWord, checkMessage, getTargetWord: () => targetWord, getTotalGuesses: () => totalGuesses }
}



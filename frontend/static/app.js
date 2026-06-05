const cfg = window.POLL_CONFIG;
const pollId = cfg.pollId;
const multipleAllowed = cfg.multipleAllowed;
const maxChoices = cfg.maxChoices;
const hideResults = cfg.hideResults;

const codeInput = document.getElementById("code-input");
const validateCodeBtn = document.getElementById("validate-code");
const codeStatus = document.getElementById("code-status");
const pollSection = document.getElementById("poll-section");
const statusDiv = document.getElementById("status");
const resultsDiv = document.getElementById("results");
const submitBtn = document.getElementById("submit-vote");

let codeValidated = false;
let validatedCode = null;

function setCodeStatus(msg, type = "") {
  codeStatus.textContent = msg;
  codeStatus.className = "status";
  if (type) codeStatus.classList.add(type);
}

function setVoteStatus(msg, type = "") {
  statusDiv.textContent = msg;
  statusDiv.className = "status";
  if (type) statusDiv.classList.add(type);
}

function enforceMultiChoiceLimit() {
  if (!multipleAllowed || !maxChoices) return;
  const boxes = Array.from(document.querySelectorAll(".multi-opt"));
  boxes.forEach((box) => {
    box.addEventListener("change", () => {
      const selected = boxes.filter((b) => b.checked);
      if (selected.length > maxChoices) {
        box.checked = false;
        alert(`You can select up to ${maxChoices} options.`);
      }
    });
  });
}

function getSelectedOptionIds() {
  if (multipleAllowed) {
    const boxes = Array.from(document.querySelectorAll(".multi-opt"));
    return boxes.filter((b) => b.checked).map((b) => parseInt(b.value, 10));
  } else {
    const radios = Array.from(document.querySelectorAll(".single-opt"));
    const selected = radios.find((r) => r.checked);
    return selected ? [parseInt(selected.value, 10)] : [];
  }
}

validateCodeBtn.addEventListener("click", async () => {
  setCodeStatus("", "");
  setVoteStatus("", "");
  pollSection.style.display = "none";
  codeValidated = false;
  validatedCode = null;

  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    setCodeStatus("Please enter a code.", "error");
    return;
  }

  try {
    const res = await fetch(`/api/polls/${pollId}/validate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCodeStatus("Error validating code.", "error");
      return;
    }
    if (!data.valid) {
      if (data.reason === "used") {
        setCodeStatus("This code has already been used.", "error");
      } else if (data.reason === "invalid") {
        setCodeStatus("Invalid code.", "error");
      } else {
        setCodeStatus("Code is not valid.", "error");
      }
      return;
    }
    setCodeStatus("Code accepted. You may now vote.", "success");
    pollSection.style.display = "block";
    codeValidated = true;
    validatedCode = code;
    enforceMultiChoiceLimit();
  } catch (err) {
    console.error(err);
    setCodeStatus("Network error validating code.", "error");
  }
});

submitBtn.addEventListener("click", async () => {
  setVoteStatus("", "");
  if (!codeValidated || !validatedCode) {
    setVoteStatus("Please validate your code first.", "error");
    return;
  }

  const optionIds = getSelectedOptionIds();

  if (!multipleAllowed && optionIds.length !== 1) {
    setVoteStatus("Please select exactly one option.", "error");
    return;
  }
  if (multipleAllowed && optionIds.length === 0) {
    setVoteStatus("Please select at least one option.", "error");
    return;
  }
  if (multipleAllowed && maxChoices && optionIds.length > maxChoices) {
    setVoteStatus(`You can select up to ${maxChoices} options.`, "error");
    return;
  }

  try {
    const res = await fetch(`/api/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option_ids: optionIds, code: validatedCode }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setVoteStatus(data.error || "Error submitting vote.", "error");
      return;
    }
    setVoteStatus("Vote submitted!", "success");
    // After successful vote, prevent reuse of this code in UI
    codeValidated = false;
    validatedCode = null;
    pollSection.style.display = "none";
    loadResults();
  } catch (err) {
    console.error(err);
    setVoteStatus("Network error submitting vote.", "error");
  }
});

async function loadResults() {
  try {
    const res = await fetch(`/api/polls/${pollId}/results`);
    const data = await res.json();
    if (!res.ok || data.error) {
      resultsDiv.textContent = data.error || "Error loading results.";
      return;
    }

    if (data.hidden) {
      resultsDiv.innerHTML = `
        <p class="muted">
          Results are currently hidden for this poll.
        </p>
        <p>Total votes cast: <strong>${data.total_votes}</strong></p>
      `;
      return;
    }

    const results = data.results;
    const totalVotes = results.reduce((sum, r) => sum + r.votes, 0) || 1;

    resultsDiv.innerHTML = "";
    results.forEach((r) => {
      const pct = Math.round((r.votes / totalVotes) * 100);
      const row = document.createElement("div");
      row.className = "result-row";
      row.innerHTML = `
        <div class="result-header">
          <span>${r.option_text}</span>
          <span>${r.votes} vote(s) • ${pct}%</span>
        </div>
        <div class="bar-container">
          <div class="bar" style="width: ${pct}%;"></div>
        </div>
      `;
      resultsDiv.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    resultsDiv.textContent = "Network error loading results.";
  }
}

// initial load
loadResults();

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

    // Show the user's selected choices
    const yourVoteCard = document.getElementById("your-vote");
    const yourVoteList = document.getElementById("your-vote-list");

    yourVoteList.innerHTML = "";

    const selectedIds = optionIds;
    const optionLabels = Array.from(document.querySelectorAll(".option-label"));

    selectedIds.forEach((id) => {
      const label = optionLabels.find((l) => {
        const input = l.querySelector("input");
        return parseInt(input.value, 10) === id;
      });

      if (label) {
        const div = document.createElement("div");
        div.textContent = "• " + label.innerText.trim();
        yourVoteList.appendChild(div);
      }
    });

    yourVoteCard.style.display = "block";

    // Hide voting UI
    pollSection.style.display = "none";

    // Hide code section completely
    document.getElementById("code-input").closest(".field-row").style.display =
      "none";
    document.querySelector(".field-label").style.display = "none";
    document.getElementById("validate-code").style.display = "none";
    document.getElementById("code-status").style.display = "none";

    // Prevent reuse of code
    codeValidated = false;
    validatedCode = null;

    // Refresh results
    loadResults();
  } catch (err) {
    console.error(err);
    setVoteStatus("Network error submitting vote.", "error");
  }
});

async function loadResults() {
  const pollId = pollSection?.getAttribute("data-poll-id");
  const resultsDiv = document.getElementById("results");

  if (!pollId || !resultsDiv) {
    console.error("Missing pollId or resultsDiv");
    return;
  }

  resultsDiv.innerHTML = "";

  try {
    const res = await fetch(`/api/polls/${pollId}/results`);
    const data = await res.json();

    // Hidden results
    if (data.hidden) {
      resultsDiv.innerHTML = `
        <div class="muted">
          Results are currently hidden.<br>
          <strong>Total voters:</strong> ${data.total_voters}<br>
          <strong>Total selections:</strong> ${data.total_selections}
        </div>
      `;
      return;
    }

    // Visible results header
    resultsDiv.innerHTML = `
      <div class="muted">
        <strong>Total voters:</strong> ${data.total_voters}<br>
        <strong>Total selections:</strong> ${data.total_selections}
      </div>
    `;

    // Only show options with at least 1 vote
    let nonZero = data.results.filter((r) => r.votes > 0);

    if (nonZero.length === 0) {
      resultsDiv.innerHTML += `
        <div class="muted" style="margin-top:10px;">
          No votes yet.
        </div>
      `;
      return;
    }

    // Sort by highest votes
    nonZero.sort((a, b) => b.votes - a.votes);

    // Loop through results
    nonZero.forEach((r) => {
      const row = document.createElement("div");
      row.className = "result-row";

      // ⭐ Bar width based on % of total voters
      const width =
        data.total_voters > 0
          ? Math.round((r.votes / data.total_voters) * 100)
          : 0;

      // ⭐ Percentage text also based on total voters
      const pct = width;

      const voteLabel = r.votes === 1 ? "1 vote" : `${r.votes} votes`;

      row.innerHTML = `
      <div class="result-label">${r.option_text}</div>
      <div class="result-bar">
        <div class="result-bar-fill" style="width:${width}%">
          ${voteLabel} (${pct}%)
        </div>
      </div>
    `;

      resultsDiv.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    resultsDiv.textContent = "Error loading results.";
  }
}

// initial load
loadResults();

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, data };
}

let selectedOptionId = null;
let selectedButtonIndex = null;

async function loadPoll(pollId) {
  const { status, data } = await fetchJSON(`/api/polls/${pollId}`); // ✅ correct URL

  if (status !== 200) {
    document.getElementById("question").innerText = "Poll not found";
    return;
  }

  document.getElementById("question").innerText = data.question;

  const optionsDiv = document.getElementById("options");
  optionsDiv.innerHTML = "";

  data.options.forEach((opt, index) => {
    const btn = document.createElement("button");
    btn.id = `opt-btn-${index}`;
    btn.innerText = opt.option_text;

    // keep your color classes
    btn.classList.add(`option-color-${index % 6}`);

    // just select, don't vote yet
    btn.onclick = () => selectOption(index, opt.id);

    optionsDiv.appendChild(btn);
    optionsDiv.appendChild(document.createElement("br"));
  });

  const submitBtn = document.createElement("button");
  submitBtn.innerText = "Submit Vote";
  submitBtn.classList.add("submit-btn");
  submitBtn.onclick = () => submitVote(pollId);
  optionsDiv.appendChild(submitBtn);

  // also load current results
  loadResults(pollId);
}

function selectOption(index, optionId) {
  selectedOptionId = optionId;

  if (selectedButtonIndex !== null) {
    const prevBtn = document.getElementById(`opt-btn-${selectedButtonIndex}`);
    if (prevBtn) prevBtn.classList.remove("selected-option");
  }

  const btn = document.getElementById(`opt-btn-${index}`);
  if (btn) btn.classList.add("selected-option");

  selectedButtonIndex = index;
}

async function submitVote(pollId) {
  const codeInput = document.getElementById("code");
  const code = codeInput ? codeInput.value.trim() : "";

  if (!selectedOptionId) {
    alert("Please select an option first");
    return;
  }

  const { status, data } = await fetchJSON("/api/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option_id: selectedOptionId, code }),
  });

  alert(data.message || data.error);

  if (status === 200) {
    loadResults(pollId);
  }
}

async function loadResults(pollId) {
  const { status, data } = await fetchJSON(`/api/polls/${pollId}/results`);
  if (status !== 200) return;

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  let total = data.reduce((sum, r) => sum + r.votes, 0) || 1;

  data.forEach((r, index) => {
    const pct = ((r.votes / total) * 100).toFixed(1);

    const row = document.createElement("div");
    row.className = "result-row";

    row.innerHTML = `
            <div class="result-label">${r.option_text}: ${r.votes} (${pct}%)</div>
            <div class="result-bar-container">
                <div class="result-bar option-color-${index % 6}" style="width: 0%"></div>
            </div>
        `;

    resultsDiv.appendChild(row);

    setTimeout(() => {
      row.querySelector(".result-bar").style.width = pct + "%";
    }, 50);
  });
}

function initPoll(pollId) {
  loadPoll(pollId);
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, data };
}

async function loadPoll(pollId) {
  const { status, data } = await fetchJSON(`/api/polls/${pollId}`);

  if (status !== 200) {
    document.getElementById("question").innerText = "Poll not found";
    return;
  }

  document.getElementById("question").innerText = data.question;

  const optionsDiv = document.getElementById("options");
  optionsDiv.innerHTML = "";

  data.options.forEach((opt, index) => {
    const btn = document.createElement("button");
    btn.innerText = opt.option_text;

    // Assign a color class based on index
    btn.classList.add(`option-color-${index % 6}`);

    btn.onclick = () => vote(pollId, opt.id);
    optionsDiv.appendChild(btn);
    optionsDiv.appendChild(document.createElement("br"));
  });

  loadResults(pollId);
}

async function loadResults(pollId) {
  const { data } = await fetchJSON(`/api/polls/${pollId}/results`);

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  let total = data.reduce((sum, r) => sum + r.votes, 0) || 1;

  data.forEach((r, index) => {
    const pct = ((r.votes / total) * 100).toFixed(1);

    const row = document.createElement("div");
    row.className = "result-row";

    const colorClass = `bar-color-${index % 6}`;

    row.innerHTML = `
      <div class="result-label">${r.option_text}: ${r.votes} (${pct}%)</div>
      <div class="result-bar-container">
          <div class="result-bar ${colorClass}" style="width: 0%"></div>
      </div>
  `;

    resultsDiv.appendChild(row);

    requestAnimationFrame(() => {
      row.querySelector(".result-bar").style.width = pct + "%";
    });
  });
}

function initPoll(pollId) {
  loadPoll(pollId);
}

async function vote(pollId, optionId) {
  const code = document.getElementById("code").value.trim();

  if (!code) {
    alert("Please enter your voting code");
    return;
  }

  const { status, data } = await fetchJSON("/api/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option_id: optionId, code }),
  });

  alert(data.message || data.error);

  if (status === 200) {
    loadResults(pollId);
  }
}

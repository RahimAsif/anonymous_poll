const optionsContainer = document.getElementById("options-container");
const addOptionBtn = document.getElementById("add-option");
const createPollBtn = document.getElementById("create-poll");
const statusDiv = document.getElementById("status");

const codesCard = document.getElementById("codes-card");
const codesTitle = document.getElementById("codes-title");
const codesCountInput = document.getElementById("codes-count");
const codesStatus = document.getElementById("codes-status");
const codesOutput = document.getElementById("codes-output");
const generateCodesConfirm = document.getElementById("generate-codes-confirm");

let currentCodesPollId = null;

createPollBtn.addEventListener("click", async () => {
  statusDiv.textContent = "";
  statusDiv.className = "status";

  const question = document.getElementById("question").value.trim();
  const multipleAllowed = document.getElementById("multiple_allowed").checked
    ? 1
    : 0;
  const maxChoicesRaw = document.getElementById("max_choices").value;
  const hideResults = document.getElementById("hide_results").checked ? 1 : 0;

  const raw = document.getElementById("options-textarea").value;

  const options = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!question) {
    statusDiv.textContent = "Question is required.";
    statusDiv.classList.add("error");
    return;
  }
  if (options.length < 2) {
    statusDiv.textContent = "At least two options are required.";
    statusDiv.classList.add("error");
    return;
  }

  let maxChoices = null;
  if (multipleAllowed) {
    maxChoices = parseInt(maxChoicesRaw, 10);
    if (isNaN(maxChoices) || maxChoices < 1) {
      statusDiv.textContent = "Max choices must be a positive integer.";
      statusDiv.classList.add("error");
      return;
    }
  }

  try {
    const res = await fetch("/api/create-poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        options,
        multiple_allowed: multipleAllowed,
        max_choices: maxChoices,
        hide_results: hideResults,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      statusDiv.textContent = data.error || "Error creating poll.";
      statusDiv.classList.add("error");
      return;
    }
    statusDiv.innerHTML = `Poll created! <a href="/poll/${data.poll_id}" target="_blank">Open poll</a>`;
    statusDiv.classList.add("success");
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Network error creating poll.";
    statusDiv.classList.add("error");
  }
});

// Generate codes buttons on existing polls
document.querySelectorAll(".btn-generate-codes").forEach((btn) => {
  btn.addEventListener("click", () => {
    const pollId = btn.getAttribute("data-poll-id");
    const question = btn.getAttribute("data-poll-question");
    currentCodesPollId = pollId;
    codesTitle.textContent = `Codes for poll #${pollId}: ${question}`;
    codesStatus.textContent = "";
    codesStatus.className = "status";
    codesOutput.value = "";
    codesCard.style.display = "block";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
});

generateCodesConfirm.addEventListener("click", async () => {
  if (!currentCodesPollId) return;

  codesStatus.textContent = "";
  codesStatus.className = "status";

  const countRaw = codesCountInput.value;
  const count = parseInt(countRaw, 10);
  if (isNaN(count) || count < 1) {
    codesStatus.textContent = "Count must be a positive integer.";
    codesStatus.classList.add("error");
    return;
  }

  try {
    const res = await fetch(`/api/polls/${currentCodesPollId}/generate-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      codesStatus.textContent = data.error || "Error generating codes.";
      codesStatus.classList.add("error");
      return;
    }
    codesStatus.textContent = `Generated ${data.codes.length} codes.`;
    codesStatus.classList.add("success");
    codesOutput.value = data.codes.join("\n");
  } catch (err) {
    console.error(err);
    codesStatus.textContent = "Network error generating codes.";
    codesStatus.classList.add("error");
  }
});

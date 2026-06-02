async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, data };
}

async function createPoll() {
  const question = document.getElementById("question").value.trim();
  const optionsText = document.getElementById("options").value.trim();

  if (!question || !optionsText) {
    alert("Question and options are required");
    return;
  }

  const options = optionsText
    .split("\n")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  const { status, data } = await fetchJSON("/api/polls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, options }),
  });

  if (status !== 201) {
    alert(data.error || "Failed to create poll");
    return;
  }

  alert("Poll created with ID: " + data.id);

  document.getElementById("question").value = "";
  document.getElementById("options").value = "";

  loadPolls();
}

async function generateCodes() {
  const count = parseInt(document.getElementById("codeCount").value);
  const pollId = prompt("Enter poll ID to generate codes for");

  if (!pollId) return;

  const { data } = await fetchJSON(`/api/polls/${pollId}/generate_codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });

  document.getElementById("generatedCodes").innerText = data.codes.join("\n");
}

async function loadPolls() {
  const { data } = await fetchJSON("/api/polls");

  const container = document.getElementById("polls");
  container.innerHTML = "";

  if (!data.length) {
    container.innerText = "No polls yet.";
    return;
  }

  data.forEach((p) => {
    const div = document.createElement("div");
    div.innerHTML = `
            <strong>ID ${p.id}</strong>: ${p.question}
            &nbsp;|&nbsp;
            <a href="/?poll_id=${p.id}" target="_blank">Open poll</a>
        `;
    container.appendChild(div);
  });
}

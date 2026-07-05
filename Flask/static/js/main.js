let time = new Date();
let hour = time.getHours();
let minute = time.getMinutes();
const url = "";

// Format minutes to always show two digits
const formattedMinute = minute < 10 ? '0' + minute : minute;
$(".set-time").text(`${hour}:${formattedMinute}`);

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scrollToBottom() {
  const chatContainer = document.getElementById("new-res");
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function getPredictions(text) {
  $.ajax({
    url: url + "/predict",
    method: "POST",
    data: {
      text: text,
    },
    crossDomain: true,
    success: function (res) {
      console.log(res);
      let time = new Date();
      let hour = time.getHours();
      let minute = time.getMinutes();
      const formattedMinute = minute < 10 ? '0' + minute : minute;
      
      var ml_pred = res.ml_pred;
      var dl_pred = res.dl_pred;
      let outputMsg = "";
      let predictionClass = "";

      if (ml_pred == "1" && dl_pred == "1") {
        outputMsg = "<strong>Analysis Result:</strong> The message contains clear signs of suicidal ideation. (Detected by both RF and LSTM models)";
        predictionClass = "prediction-suicide";
      } else if (ml_pred == "0" && dl_pred == "0") {
        outputMsg = "<strong>Analysis Result:</strong> The message does not appear to contain suicidal ideation. (Both models agree)";
        predictionClass = "prediction-non-suicide";
      } else if (
        (ml_pred == "0" && dl_pred == "1") ||
        (ml_pred == "1" && dl_pred == "0")
      ) {
        outputMsg = "<strong>Analysis Result:</strong> Mixed signals detected. The models did not fully agree. Please review the text carefully.";
        predictionClass = "prediction-mixed";
      } else {
        outputMsg = "Sorry, we were unable to generate a valid prediction for this message.";
        predictionClass = "";
      }

      $("#new-res").append(`
        <div class="msg right-msg">
          <div class="msg-avatar msg-avatar-user">
            <i class="fas fa-user"></i>
          </div>
          <div class="msg-bubble">
            <div class="msg-info">
              <div class="msg-info-name">You</div>
              <div class="msg-info-time">${hour}:${formattedMinute}</div>
            </div>
            <div class="msg-text">
              ${escapeHtml(text)}
            </div>
          </div>
        </div>
        
        <div class="msg left-msg">
          <div class="msg-avatar msg-avatar-bot">
            <i class="fas fa-robot"></i>
          </div>
          <div class="msg-bubble ${predictionClass}">
            <div class="msg-info">
              <div class="msg-info-name">MindSafe Bot</div>
              <div class="msg-info-time">${hour}:${formattedMinute}</div>
            </div>
            <div class="msg-text">
              ${outputMsg}
            </div>
          </div>
        </div>
      `);
      
      scrollToBottom();
    },
    error: function (err) {
      console.log(err);
    },
  });
  return;
}

function submitHandler() {
  var input = $("#user-input").val();
  if (input.trim() == "") return;
  getPredictions(input);
  $("#user-input").val("");
}

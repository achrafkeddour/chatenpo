// === Enhanced Chat Application Script ===
const socket = io();

// Global Variables
let currentRecipient = null;
let typingTimeout = null;
let darkMode = localStorage.getItem('darkMode') === 'true' || false;
let localStream = null;
let peerConnection = null;
let activeCallUser = null;
let messageIds = new Set();
let userStatuses = new Map();
let isVideoCall = false;

// WebRTC Configuration
const peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// === Utility Functions ===
function showUserList() {
  $("#conversationView").removeClass("active");
  $("#userList").addClass("active");
  $("#userSearch").val("");
}

function showConversation(recipient) {
  currentRecipient = recipient;
  $("#userList").removeClass("active");
  $("#conversationView").addClass("active");
  $("#conversationTitle").text(`Chatting with ${recipient}`);
  $("#messages").empty();
  $("#typingIndicator").text("");
  socket.emit("get messages", { withUser: recipient });
}

function toggleDarkMode() {
  darkMode = !darkMode;
  document.body.dataset.theme = darkMode ? 'dark' : 'light';
  localStorage.setItem('darkMode', darkMode);
  $("#themeToggle i").toggleClass("fa-moon fa-sun");
  console.log(`Theme switched to ${darkMode ? 'dark' : 'light'}`);
}

function scrollMessages() {
  const messagesDiv = $("#messages");
  messagesDiv.animate({ scrollTop: messagesDiv.prop("scrollHeight") }, 300);
}

function logout() {
  if (confirm("Are you sure you want to logout?")) {
    window.location.href = "/logout";
  }
}

// === Call Functions (Voice and Video) ===
function initiateVoiceCall() {
  if (!currentRecipient) {
    alert("Please select a user to call!");
    return;
  }
  isVideoCall = false;
  activeCallUser = currentRecipient;
  console.log(`Initiating voice call with ${activeCallUser}`);
  startLocalStream(false)
    .then(() => {
      createPeerConnection();
      peerConnection.addStream(localStream);
      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
          socket.emit("call user", { recipient: activeCallUser, offer: peerConnection.localDescription, video: false });
          showInCallUI(activeCallUser, false);
          $("#ringtone")[0].play();
        })
        .catch(err => console.error("Error creating offer:", err));
    })
    .catch(err => console.error("Failed to get local stream:", err));
}

function initiateVideoCall() {
  if (!currentRecipient) {
    alert("Please select a user to call!");
    return;
  }
  isVideoCall = true;
  activeCallUser = currentRecipient;
  console.log(`Initiating video call with ${activeCallUser}`);
  startLocalStream(true)
    .then(() => {
      createPeerConnection();
      peerConnection.addStream(localStream);
      $("#localVideo")[0].srcObject = localStream; // Display local video
      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
          socket.emit("call user", { recipient: activeCallUser, offer: peerConnection.localDescription, video: true });
          showInCallUI(activeCallUser, true);
          $("#ringtone")[0].play();
        })
        .catch(err => console.error("Error creating offer:", err));
    })
    .catch(err => console.error("Failed to get local stream:", err));
}

function startLocalStream(includeVideo) {
  console.log(`Requesting local ${includeVideo ? 'video and audio' : 'audio only'} stream...`);
  const constraints = { audio: true, video: includeVideo ? { width: 320, height: 240 } : false };
  return navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      localStream = stream;
      console.log("Local stream initialized.");
    });
}

function createPeerConnection() {
  console.log("Creating new PeerConnection...");
  peerConnection = new RTCPeerConnection(peerConnectionConfig);
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("webrtc signal", { recipient: activeCallUser, signal: { ice: event.candidate } });
      console.log("Sent ICE candidate:", event.candidate);
    }
  };
  peerConnection.onaddstream = event => {
    console.log("Received remote stream via onaddstream");
    const remoteVideo = $("#remoteVideo")[0];
    remoteVideo.srcObject = event.stream;
  };
  peerConnection.ontrack = event => {
    console.log("Received remote stream via ontrack");
    const remoteVideo = $("#remoteVideo")[0];
    remoteVideo.srcObject = event.streams[0];
  };
  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === "disconnected" || peerConnection.iceConnectionState === "failed") {
      endCall();
    }
  };
}

function answerCall() {
  $("#callButtons").hide();
  $("#inCallControls").show();
  activeCallUser = currentRecipient;
  startLocalStream(isVideoCall)
    .then(() => {
      createPeerConnection();
      peerConnection.addStream(localStream);
      if (isVideoCall) $("#localVideo")[0].srcObject = localStream;
      const remoteOffer = window.incomingOffer;
      peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
          socket.emit("answer call", { recipient: activeCallUser, answer: peerConnection.localDescription });
          showInCallUI(activeCallUser, isVideoCall);
        })
        .catch(err => console.error("Error answering call:", err));
    })
    .catch(err => console.error("Stream error:", err));
}

function declineCall() {
  socket.emit("end call", { recipient: currentRecipient });
  hideCallModal();
  $("#ringtone")[0].pause();
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
    console.log("PeerConnection closed.");
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    console.log("Local stream stopped.");
  }
  socket.emit("end call", { recipient: activeCallUser });
  hideCallModal();
  $("#ringtone")[0].pause();
  $("#localVideo")[0].srcObject = null;
  $("#remoteVideo")[0].srcObject = null;
  activeCallUser = null;
  isVideoCall = false;
}

function showCallModal(caller, offer, video) {
  $("#callModal").addClass("active");
  $("#callStatus").text(`Incoming ${video ? 'Video' : 'Voice'} Call`);
  $("#callerInfo").text(`Call from: ${caller}`);
  currentRecipient = caller;
  window.incomingOffer = offer;
  isVideoCall = video;
  if (video) $("#videoContainer").show();
  else $("#videoContainer").hide();
  $("#ringtone")[0].play();
}

function hideCallModal() {
  $("#callModal").removeClass("active");
  $("#callStatus").text("");
  $("#callerInfo").text("");
  $("#callButtons").show();
  $("#inCallControls").hide();
  $("#videoContainer").hide();
  $("#ringtone")[0].pause();
}

function showInCallUI(caller, video) {
  $("#callModal").addClass("active");
  $("#callStatus").text(`In ${video ? 'Video' : 'Voice'} Call`);
  $("#callerInfo").text(`Talking with: ${caller}`);
  $("#callButtons").hide();
  $("#inCallControls").show();
  $("#activeCallUser").text(caller);
  if (video) $("#videoContainer").show();
  else $("#videoContainer").hide();
}

// === User Profile Functions ===
function showUserProfile() {
  if (!currentRecipient) {
    alert("Select a user to view their profile!");
    return;
  }
  $("#profileUsername").text(currentRecipient);
  $("#profileStatus").text(userStatuses.get(currentRecipient) || "Online");
  $("#profileLastSeen").text(new Date().toLocaleString());
  $("#profileModal").addClass("active");
}

function hideProfileModal() {
  $("#profileModal").removeClass("active");
}

// === Message Handling ===
function deleteMessage(messageId) {
  if (confirm("Are you sure you want to delete this message?")) {
    socket.emit("delete message", { messageId, recipient: currentRecipient });
    $(`.message[data-id="${messageId}"]`).fadeOut(300, function() { $(this).remove(); });
  }
}

// === DOM Ready ===
$(function() {
  if (darkMode) {
    document.body.dataset.theme = "dark";
    $("#themeToggle i").removeClass("fa-moon").addClass("fa-sun");
  }
  $("#themeToggle").click(toggleDarkMode);

  $("#userSearch").on("input", function() {
    const searchTerm = $(this).val().toLowerCase();
    $(".user-item").each(function() {
      const userName = $(this).text().toLowerCase();
      $(this).toggle(userName.includes(searchTerm));
    });
  });

  $("#message").on("input", function() {
    if (!currentRecipient) return;
    clearTimeout(typingTimeout);
    socket.emit("typing", { recipient: currentRecipient });
    typingTimeout = setTimeout(() => {
      socket.emit("stop typing", { recipient: currentRecipient });
    }, 2000);
  });

  $("#form").submit(function(event) {
    event.preventDefault();
    const message = $("#message").val().trim();
    const fileInput = $("#image")[0];
    const formData = new FormData();

    if (!currentRecipient) {
      alert("Please select a user to send a message to!");
      return;
    }

    if (message || fileInput.files.length > 0) {
      if (fileInput.files.length > 0) {
        formData.append("image", fileInput.files[0]);
        $.ajax({
          url: "/upload",
          type: "POST",
          data: formData,
          processData: false,
          contentType: false,
          success: function(data) {
            socket.emit("private message", {
              recipient: currentRecipient,
              message: message,
              imageUrl: data.imageUrl
            });
            const time = new Date().toLocaleTimeString();
            if (message) {
              $("#messages").append(
                `<div class="message sent">
                  <span class="content">${message}</span>
                  <span class="timestamp">${time}</span>
                  <span class="status"></span>
                  <button class="delete-btn" onclick="deleteMessage(this.parentElement.dataset.id)">Delete</button>
                </div>`
              ).children().last().hide().fadeIn(300);
            }
            $("#messages").append(
              `<div class="message sent">
                <img src="${data.imageUrl}" class="img-fluid message-img" data-bs-toggle="modal" data-bs-target="#imageModal" data-src="${data.imageUrl}"/>
                <span class="timestamp">${time}</span>
                <span class="status"></span>
                <button class="delete-btn" onclick="deleteMessage(this.parentElement.dataset.id)">Delete</button>
              </div>`
            ).children().last().hide().fadeIn(300);
            $("#message").val("");
            $("#image").val("");
            scrollMessages();
          },
          error: function(err) {
            console.error("Image upload failed:", err);
            alert("Failed to upload image!");
          }
        });
      } else {
        socket.emit("private message", { recipient: currentRecipient, message });
        const time = new Date().toLocaleTimeString();
        $("#messages").append(
          `<div class="message sent">
            <span class="content">${message}</span>
            <span class="timestamp">${time}</span>
            <span class="status"></span>
            <button class="delete-btn" onclick="deleteMessage(this.parentElement.dataset.id)">Delete</button>
          </div>`
        ).children().last().hide().fadeIn(300);
        $("#message").val("");
        scrollMessages();
      }
    }
  });

  socket.on("private message", function({ sender, message, imageUrl, id }) {
    if (currentRecipient === sender) {
      const time = new Date().toLocaleTimeString();
      messageIds.add(id);
      if (message) {
        $("#messages").append(
          `<div class="message received" data-id="${id}">
            <span class="content">${message}</span>
            <span class="timestamp">${time}</span>
          </div>`
        ).children().last().hide().fadeIn(300);
      }
      if (imageUrl) {
        $("#messages").append(
          `<div class="message received" data-id="${id}">
            <img src="${imageUrl}" class="img-fluid message-img" data-bs-toggle="modal" data-bs-target="#imageModal" data-src="${imageUrl}"/>
            <span class="timestamp">${time}</span>
          </div>`
        ).children().last().hide().fadeIn(300);
      }
      $("#notificationSound")[0].play();
      scrollMessages();
      socket.emit("message read", { messageId: id, recipient: currentRecipient });
    } else {
      $(`.user-item:contains(${sender})`).addClass("unread");
    }
  });

  socket.on("updateUserList", function(users) {
    $(".user-list-body").empty();
    $("#onlineCount").text(users.length);
    users.forEach(user => {
      const status = userStatuses.get(user) || "Online";
      $(".user-list-body").append(
        `<button class="list-group-item list-group-item-action user-item">
          <span class="online-status ${status.toLowerCase()}"></span>
          ${user} <small>(${status})</small>
        </button>`
      ).find(".user-item:last").click(function() {
        $(this).removeClass("unread");
        showConversation(user);
      });
    });
  });

  socket.on("typing", function({ sender }) {
    if (currentRecipient === sender) {
      $("#typingIndicator").html(
        `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span> ${sender} is typing...`
      );
    }
  });

  socket.on("stop typing", function({ sender }) {
    if (currentRecipient === sender) $("#typingIndicator").text("");
  });

  socket.on("message history", function(messages) {
    $("#messages").empty();
    messages.forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const isSent = msg.sender !== currentRecipient;
      const messageClass = isSent ? "sent" : "received";
      if (msg.message) {
        $("#messages").append(
          `<div class="message ${messageClass}" data-id="${msg.id}">
            <span class="content">${msg.message}</span>
            <span class="timestamp">${time}</span>
            ${isSent ? `<span class="status">${msg.read ? 'Seen' : 'Sent'}</span>` : ''}
            ${isSent ? `<button class="delete-btn" onclick="deleteMessage(${msg.id})">Delete</button>` : ''}
          </div>`
        );
      }
      if (msg.image_url) {
        $("#messages").append(
          `<div class="message ${messageClass}" data-id="${msg.id}">
            <img src="${msg.image_url}" class="img-fluid message-img" data-bs-toggle="modal" data-bs-target="#imageModal" data-src="${msg.image_url}"/>
            <span class="timestamp">${time}</span>
            ${isSent ? `<span class="status">${msg.read ? 'Seen' : 'Sent'}</span>` : ''}
            ${isSent ? `<button class="delete-btn" onclick="deleteMessage(${msg.id})">Delete</button>` : ''}
          </div>`
        );
      }
    });
    scrollMessages();
  });

  socket.on("message read", function({ messageId }) {
    $(`.message[data-id="${messageId}"] .status`).text("Seen").addClass("seen");
  });

  socket.on("message deleted", function({ messageId }) {
    $(`.message[data-id="${messageId}"]`).fadeOut(300, function() { $(this).remove(); });
  });

  socket.on("call user", function({ caller, offer, video }) {
    showCallModal(caller, offer, video);
  });

  socket.on("answer call", function({ answer }) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      .catch(err => console.error("Error setting remote description:", err));
  });

  socket.on("webrtc signal", function({ signal }) {
    if (signal.ice) {
      peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch(err => console.error("Error adding ICE candidate:", err));
    }
  });

  socket.on("call ended", function() {
    endCall();
  });

  $(document).on("click", ".message-img", function() {
    $("#imageModalImg").attr("src", $(this).data("src"));
  });
});

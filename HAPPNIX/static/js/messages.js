(function () {
  const modal = document.getElementById("messages-modal");
  if (!modal) return;
  const card = document.getElementById("messages-card");
  const searchInput = document.getElementById("message-user-search");
  const searchResultsEl = document.getElementById(
    "message-user-search-results",
  );
  const conversationListEl = document.getElementById(
    "message-conversation-list",
  );
  const conversationStatusEl = document.getElementById(
    "message-conversation-status",
  );
  const liveStatusEl = document.getElementById("message-live-status");
  const threadHeaderEl = document.getElementById("message-thread-header");
  const threadBodyEl = document.getElementById("message-thread-body");
  const sidebarEl = document.getElementById("messages-sidebar");
  const threadPanelEl = document.getElementById("messages-thread-panel");
  const mobileViewport = window.matchMedia("(max-width: 767px)");
  const composeInput = document.getElementById("message-compose-input");
  const composeStatusEl = document.getElementById("message-compose-status");
  const composePreviewEl = document.getElementById("message-compose-preview");
  const composePreviewItemsEl = document.getElementById(
    "message-compose-preview-items",
  );
  const attachmentInput = document.getElementById("message-attachment-input");
  const attachBtn = document.getElementById("message-attach-btn");
  const voiceBtn = document.getElementById("message-voice-btn");
  const clearPreviewBtn = document.getElementById("message-clear-preview-btn");
  const sendBtn = document.getElementById("message-send-btn");
  const forwardPanelEl = document.getElementById("message-forward-panel");
  const forwardStatusEl = document.getElementById("message-forward-status");
  const forwardSearchInput = document.getElementById("message-forward-search");
  const forwardResultsEl = document.getElementById("message-forward-results");
  const forwardCancelBtn = document.getElementById(
    "message-forward-cancel-btn",
  );
  const replyPreviewEl = document.getElementById("message-reply-preview");
  const replyToUsernameEl = document.getElementById("reply-to-username");
  const replyToBodyEl = document.getElementById("reply-to-body");
  const clearReplyBtn = document.getElementById("message-clear-reply-btn");
  const badgeEls = [
    document.getElementById("mobile-message-badge"),
    document.getElementById("desktop-message-badge"),
  ].filter(Boolean);
  const defaultAvatar =
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";
  const MAX_ATTACHMENTS = 5;
  const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
  let attachmentSeq = 0;
  const state = {
    conversations: [],
    messagesByConversation: {},
    activeConversationId: null,
    unreadCount: 0,
    searchQuery: "",
    searchResults: [],
    searchTimer: null,
    opening: false,
    loadingMessages: false,
    sending: false,
    socket: null,
    socketConnected: false,
    socketReconnectTimer: null,
    socketReconnectDelayMs: 1500,
    pendingAttachments: [],
    mediaRecorder: null,
    recordingStream: null,
    recordingChunks: [],
    recordingStartedAt: null,
    openMessageMenuId: null,
    forwardingMessageId: null,
    forwarding: false,
    forwardSearchQuery: "",
    forwardSearchResults: [],
    forwardSearchTimer: null,
    replyingToMessageId: null,
    drafts: {},
    isTyping: false,
    typingIndicators: {},
    mobileView: "list",
  };

  function stopTypingSignal() {
    if (state.isTyping && state.activeConversationId && state.socketConnected) {
      const conversation = getActiveConversation();
      if (conversation && conversation.otherUser?.sql_user_id) {
        state.socket.send(
          JSON.stringify({
            type: "typing",
            conversationId: conversation.id,
            targetUserId: conversation.otherUser.sql_user_id,
            isTyping: false,
          }),
        );
      }
    }
    state.isTyping = false;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function getCsrfToken() {
    const cfg = document.getElementById("home-page-boot-config");
    if (cfg) {
      try {
        const data = JSON.parse(cfg.textContent || "{}");
        if (data.csrfToken && data.csrfToken !== "NOTPROVIDED")
          return data.csrfToken;
      } catch (_e) {}
    }
    const parts = `; ${document.cookie}`.split("; csrftoken=");
    return parts.length === 2 ? parts.pop().split(";").shift() : "";
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      credentials: "same-origin",
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }

  async function postMultipart(url, formData) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-CSRFToken": getCsrfToken() },
      credentials: "same-origin",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toDateString() === new Date().toDateString()
      ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatBytes(value) {
    const size = Number(value || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getDynamicOnlineStatus(lastActive) {
    if (!lastActive || lastActive === "undefined") return false;
    const date = new Date(lastActive);
    if (isNaN(date.getTime())) return false;
    return new Date() - date < 45000;
  }

  function getActiveStatusText(lastActive) {
    const isOnline = getDynamicOnlineStatus(lastActive);
    if (isOnline) return "Online";
    if (!lastActive || lastActive === "undefined") return "Offline";

    const date = new Date(lastActive);
    if (isNaN(date.getTime())) return "Offline";

    const now = new Date();
    let diffMins = Math.floor((now - date) / 60000);
    diffMins = Math.max(0, diffMins);

    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Active just now";
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    if (diffDays === 1) return "Active yesterday";
    return `Active ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  }

  function formatActiveStatus(lastActive) {
    const label = getActiveStatusText(lastActive);
    const isOnline = label === "Online";
    return `<span class="${isOnline ? "text-emerald-400 font-medium tracking-wide flex items-center gap-1.5" : "text-gray-400"}">${isOnline ? '<span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>' : ""}${escapeHtml(label)}</span>`;
  }

  function isMobileLayout() {
    return mobileViewport.matches;
  }

  function renderResponsiveLayout() {
    const showThread =
      !isMobileLayout() ||
      (state.mobileView === "thread" && Number(state.activeConversationId));

    if (sidebarEl) {
      sidebarEl.classList.toggle("hidden", isMobileLayout() && showThread);
      sidebarEl.classList.toggle("flex", !isMobileLayout() || !showThread);
    }
    if (threadPanelEl) {
      threadPanelEl.classList.toggle("hidden", !showThread);
      threadPanelEl.classList.toggle("flex", showThread);
    }
  }

  function setMobileView(view) {
    state.mobileView = view;
    renderResponsiveLayout();
  }

  function getConversationStatusMeta(conversation) {
    const other = conversation?.otherUser || {};
    const isTyping = !!state.typingIndicators[Number(conversation?.id || 0)];
    return {
      isTyping,
      typingMarkup: isTyping
        ? '<span class="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Typing...</span>'
        : "",
      presenceMarkup: `<span class="inline-flex items-center gap-1 rounded-full border ${getDynamicOnlineStatus(other.lastActive) ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-gray-400"} px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"><span class="h-1.5 w-1.5 rounded-full ${getDynamicOnlineStatus(other.lastActive) ? "bg-emerald-400" : "bg-gray-500"}"></span>${escapeHtml(getActiveStatusText(other.lastActive))}</span>`,
    };
  }

  function renderTypingBubble() {
    const conversation = getActiveConversation();
    if (!conversation || !state.typingIndicators[Number(conversation.id)]) return;
    const container = threadBodyEl.querySelector(
      ".mx-auto.flex.w-full.max-w-3xl.flex-col",
    );
    if (!container || document.getElementById("typing-indicator-bubble")) return;
    container.insertAdjacentHTML(
      "beforeend",
      `<div id="typing-indicator-bubble" class="mb-2 mt-1 flex justify-start"><div class="flex max-w-[96%] items-start flex-row"><div class="flex h-[44px] max-w-full items-center gap-1.5 rounded-[1.5rem] border border-white/10 bg-white/[0.06] px-4 py-3 shadow-lg"><span class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style="animation-delay: 0ms;"></span><span class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style="animation-delay: 150ms;"></span><span class="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style="animation-delay: 300ms;"></span></div></div></div>`,
    );
    threadBodyEl.scrollTop = threadBodyEl.scrollHeight;
  }

  function toggleTypingIndicator(conversationId, isTyping) {
    state.typingIndicators[conversationId] = isTyping;
    renderConversationList();
    if (Number(conversationId) === Number(state.activeConversationId)) {
      renderThread();
    }
  }
  function autosizeComposer() {
    if (!composeInput) return;
    composeInput.style.height = "auto";
    composeInput.style.height = `${Math.min(composeInput.scrollHeight, 144)}px`;
  }

  function showComposeStatus(message, isError) {
    if (!composeStatusEl) return;
    if (!message) {
      composeStatusEl.className = "mb-2 hidden text-sm text-rose-300";
      composeStatusEl.textContent = "";
      return;
    }
    composeStatusEl.className = `mb-2 text-sm ${isError ? "text-rose-300" : "text-emerald-300"}`;
    composeStatusEl.textContent = message;
  }

  function showForwardStatus(message, isError) {
    if (!forwardStatusEl) return;
    forwardStatusEl.className = `mt-1 text-sm ${isError ? "text-rose-200" : "text-sky-100"}`;
    forwardStatusEl.textContent =
      message || "Choose a conversation or search for someone.";
  }

  function setLiveStatus() {
    if (!liveStatusEl) return;
    liveStatusEl.textContent = state.socketConnected
      ? "Live chat connected"
      : "Reconnecting live chat";
    liveStatusEl.className = `text-xs uppercase tracking-[0.24em] ${state.socketConnected ? "text-emerald-300/80" : "text-amber-300/80"}`;
  }

  function recalcUnread() {
    state.unreadCount = state.conversations.reduce(
      (sum, item) => sum + Number(item.unreadCount || 0),
      0,
    );
    badgeEls.forEach((el) => {
      const has = state.unreadCount > 0;
      el.textContent = String(state.unreadCount || "");
      el.classList.toggle("hidden", !has);
      el.classList.toggle("inline-flex", has);
    });
  }

  function sortConversations() {
    state.conversations.sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime(),
    );
  }

  function upsertConversation(conversation) {
    if (!conversation?.id) return;
    const idx = state.conversations.findIndex(
      (item) => Number(item.id) === Number(conversation.id),
    );
    if (idx >= 0) state.conversations[idx] = conversation;
    else state.conversations.push(conversation);
    sortConversations();
    recalcUnread();
  }

  function replaceMessageInCache(message) {
    const conversationId = Number(message?.conversationId || 0);
    if (!conversationId) return;
    const list = state.messagesByConversation[conversationId] || [];
    const idx = list.findIndex(
      (item) => Number(item.id) === Number(message.id),
    );
    if (idx >= 0) list[idx] = message;
    else list.push(message);
    list.sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    );
    state.messagesByConversation[conversationId] = list;
  }

  function removeMessageFromCache(conversationId, messageId) {
    state.messagesByConversation[conversationId] = (
      state.messagesByConversation[conversationId] || []
    ).filter((item) => Number(item.id) !== Number(messageId));
  }

  function getActiveConversation() {
    return (
      state.conversations.find(
        (item) => Number(item.id) === Number(state.activeConversationId),
      ) || null
    );
  }

  function getActiveMessages() {
    return (
      state.messagesByConversation[Number(state.activeConversationId || 0)] ||
      []
    );
  }

  function getMessageById(messageId) {
    return (
      getActiveMessages().find(
        (item) => Number(item.id) === Number(messageId),
      ) || null
    );
  }

  function revokeAttachmentPreview(item) {
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }

  function renderSearchResults() {
    const query = String(state.searchQuery || "").trim();
    if (!query) {
      searchResultsEl.innerHTML = "";
      return;
    }
    if (!state.searchResults.length) {
      searchResultsEl.innerHTML =
        '<div class="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-sm text-gray-400">No users found.</div>';
      return;
    }
    searchResultsEl.innerHTML = state.searchResults
      .map(
        (user) =>
          `<button type="button" data-message-action="start-chat" data-user-id="${user.sql_user_id}" class="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left hover:bg-white/[0.06]"><img src="${escapeHtml(user.profile_picture_url || defaultAvatar)}" class="h-11 w-11 rounded-full object-cover"><div class="min-w-0 flex-1"><div class="truncate text-sm font-bold text-white">${escapeHtml(user.full_name || user.username)}</div><div class="truncate text-xs text-gray-400">@${escapeHtml(user.username)}</div></div><span class="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-200">Chat</span></button>`,
      )
      .join("");
    refreshIcons();
  }

  function renderConversationList() {
    conversationStatusEl.textContent = state.conversations.length
      ? state.socketConnected
        ? "Live conversations"
        : "Connecting live chat..."
      : "No conversations yet";
    if (!state.conversations.length) {
      conversationListEl.innerHTML =
        '<div class="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-gray-500">Search for a user above to start your first chat.</div>';
      renderResponsiveLayout();
      return;
    }
    conversationListEl.innerHTML = state.conversations
      .map((conversation) => {
        const other = conversation.otherUser || {};
        const preview = escapeHtml(
          conversation.previewText ||
            conversation.lastMessage?.body ||
            "No messages yet",
        );
        const active =
          Number(conversation.id) === Number(state.activeConversationId);
        const isOnline = getDynamicOnlineStatus(other.lastActive);
        const statusMeta = getConversationStatusMeta(conversation);
        return `<button type="button" data-message-action="open-conversation" data-conversation-id="${conversation.id}" class="flex w-full items-start gap-3 rounded-[1.35rem] border px-3 py-3 text-left transition ${active ? "border-fuchsia-400/40 bg-fuchsia-500/10 shadow-[0_10px_30px_rgba(217,70,239,0.08)]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}">
        <div class="relative pt-0.5">
            <img src="${escapeHtml(other.profile_picture_url || defaultAvatar)}" class="h-12 w-12 rounded-full object-cover ring-1 ring-white/10">
            ${isOnline ? `<span class="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full border-2 border-slate-900 bg-emerald-500"></span>` : ""}
            ${conversation.unreadCount ? `<span class="absolute -right-1 -top-1 inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold text-white">${conversation.unreadCount}</span>` : ""}
        </div>
        <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="truncate text-sm font-bold text-white">${escapeHtml(other.full_name || other.username || "Unknown")}</div>
                    <div class="truncate text-[11px] text-gray-500">@${escapeHtml(other.username || "unknown")}</div>
                </div>
                <div class="shrink-0 pt-0.5 text-[11px] text-gray-500">${escapeHtml(formatTime(conversation.lastMessage?.createdAt || conversation.updatedAt))}</div>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">${statusMeta.typingMarkup}${statusMeta.presenceMarkup}</div>
            <div class="mt-2 truncate text-xs leading-5 ${conversation.unreadCount ? "text-white" : "text-gray-400"}">${preview}</div>
        </div>
    </button>`;
      })
      .join("");
    renderResponsiveLayout();
  }

  function attachmentKind(file) {
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "file";
  }

  function clearPendingAttachments() {
    state.pendingAttachments.forEach(revokeAttachmentPreview);
    state.pendingAttachments = [];
    renderAttachmentPreview();
  }

  function addAttachments(files, options = {}) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (state.pendingAttachments.length + list.length > MAX_ATTACHMENTS) {
      showComposeStatus(
        `Only ${MAX_ATTACHMENTS} attachments are allowed per message.`,
        true,
      );
      return;
    }
    for (const file of list) {
      if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
        showComposeStatus("Each attachment must be 25 MB or smaller.", true);
        return;
      }
    }
    state.pendingAttachments = state.pendingAttachments.concat(
      list.map((file) => ({
        localId: `a-${Date.now()}-${++attachmentSeq}`,
        file,
        kind: options.kind || attachmentKind(file),
        previewUrl: URL.createObjectURL(file),
        durationSeconds: options.durationSeconds || null,
      })),
    );
    renderAttachmentPreview();
    showComposeStatus("", false);
  }

  function renderAttachmentPreview() {
    const hasItems = state.pendingAttachments.length > 0;
    composePreviewEl.classList.toggle("hidden", !hasItems);
    if (!hasItems) {
      composePreviewItemsEl.innerHTML = "";
      refreshIcons();
      return;
    }
    composePreviewItemsEl.innerHTML = state.pendingAttachments
      .map((item) => {
        const preview =
          item.kind === "image"
            ? `<img src="${item.previewUrl}" class="h-16 w-16 rounded-xl object-cover">`
            : item.kind === "video"
              ? `<video src="${item.previewUrl}" class="h-16 w-16 rounded-xl object-cover" muted playsinline></video>`
              : item.kind === "audio"
                ? `<audio src="${item.previewUrl}" class="w-full max-w-[220px]" controls preload="metadata"></audio>`
                : `<div class="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white"><i data-lucide="file" class="w-4 h-4"></i></div>`;
        const title =
          item.kind === "audio" && item.durationSeconds
            ? `Voice note � ${item.durationSeconds}s`
            : item.file.name;
        return `<div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3">${preview}<div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold text-white">${escapeHtml(title)}</div><div class="truncate text-xs text-gray-400">${escapeHtml(formatBytes(item.file.size))}</div></div><button type="button" data-message-action="remove-pending-attachment" data-local-id="${item.localId}" class="text-gray-400 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
      })
      .join("");
    refreshIcons();
  }

  function renderMessageAttachments(message) {
    const attachments = Array.isArray(message.attachments)
      ? message.attachments
      : [];
    if (!attachments.length) return "";
    return `<div class="mt-3 space-y-3">${attachments
      .map((attachment) => {
        if (attachment.type === "image")
          return `<img src="${escapeHtml(attachment.url)}" class="max-h-72 w-full rounded-2xl object-cover" alt="${escapeHtml(attachment.name || "image")}">`;
        if (attachment.type === "video")
          return `<video src="${escapeHtml(attachment.url)}" class="max-h-72 w-full rounded-2xl object-cover" controls playsinline preload="metadata"></video>`;
        if (attachment.type === "audio")
          return `<div class="rounded-2xl border border-white/10 bg-black/20 p-3"><div class="mb-2 text-xs text-gray-300">Voice note${attachment.durationSeconds ? ` � ${attachment.durationSeconds}s` : ""}</div><audio src="${escapeHtml(attachment.url)}" class="w-full" controls preload="metadata"></audio></div>`;
        return `<a href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 hover:bg-black/30"><div class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white"><i data-lucide="file" class="w-4 h-4"></i></div><div class="min-w-0"><div class="truncate text-sm font-semibold text-white">${escapeHtml(attachment.name || "Attachment")}</div><div class="text-xs text-gray-300">${escapeHtml(formatBytes(attachment.size || 0))}</div></div></a>`;
      })
      .join("")}</div>`;
  }

  function renderForwardedFrom(message) {
    if (!message.isForwarded || !message.forwardedFrom) return "";
    const source = message.forwardedFrom;
    const sender = source.sender || {};
    return `<div class="mb-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5"><div class="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Forwarded</div><div class="mt-1 text-xs font-semibold text-white/85">${escapeHtml(sender.full_name || sender.username || "Unknown")}</div><div class="mt-1 text-xs text-white/70 line-clamp-2">${escapeHtml(source.previewText || "Message")}</div></div>`;
  }

  function renderSpecialMessageBody(message) {
    const body = String(message.body || "");
    if (!body.startsWith("[Ticket Invite]")) {
      return body
        ? `<div class="whitespace-pre-wrap break-words text-sm leading-6 ${message.isUnsent ? "italic text-white/80" : ""}">${escapeHtml(body)}</div>`
        : "";
    }
    const lines = body.split("\n").map((line) => String(line || "").trim()).filter(Boolean);
    const fields = {};
    lines.slice(1).forEach((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) return;
      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      if (key && value) fields[key] = value;
    });
    const eventTitle = fields.event || "Shared Event Ticket";
    const addedBy = fields["added by"] || "";
    const displayName = fields["display name"] || "";
    const invite = fields.invite || "Confirmed";
    const status = fields.status || "Pending";
    const tier = fields.tier || "General";
    const amount = fields.amount || "Free";
    const ticketId = fields["ticket id"] || "";
    const footer = lines.find((line) => /^open my events/i.test(line)) || "Open My Events to view your ticket.";
    return `<div class="overflow-hidden rounded-[1.75rem] border border-cyan-400/25 bg-gradient-to-br from-cyan-500/18 via-slate-950 to-slate-900"><div class="border-b border-cyan-400/15 px-4 py-3"><div class="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">Ticket Share</div><div class="mt-2 text-lg font-black text-white">${escapeHtml(eventTitle)}</div><div class="mt-1 text-xs text-cyan-100/80">${escapeHtml(displayName || addedBy || 'Shared with you')}</div></div><div class="grid grid-cols-2 gap-3 px-4 py-4 text-sm"><div class="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"><div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Added By</div><div class="mt-1 font-semibold text-white">${escapeHtml(addedBy || displayName || 'Unknown')}</div></div><div class="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"><div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Status</div><div class="mt-1 font-semibold text-white">${escapeHtml(status)}</div></div><div class="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"><div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Invite</div><div class="mt-1 font-semibold text-white">${escapeHtml(invite)}</div></div><div class="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"><div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Tier</div><div class="mt-1 font-semibold text-white">${escapeHtml(tier)}</div></div><div class="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"><div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Amount</div><div class="mt-1 font-semibold text-white">${escapeHtml(amount)}</div></div><div class="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"><div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Ticket ID</div><div class="mt-1 font-semibold text-white">${escapeHtml(ticketId || 'Pending')}</div></div></div><div class="border-t border-dashed border-cyan-400/20 px-4 py-3 text-xs text-cyan-100/85">${escapeHtml(footer)}</div></div>`;
  }

  function renderMessageMenu(message) {
    const open = Number(state.openMessageMenuId) === Number(message.id);
    const items = [];
    if (message.canForward)
      items.push(
        `<button type="button" data-message-action="forward-message" data-message-id="${message.id}" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-white/10"><i data-lucide="forward" class="h-4 w-4"></i><span>Forward</span></button>`,
      );
    if (message.canEdit)
      items.push(
        `<button type="button" data-message-action="edit-message" data-message-id="${message.id}" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-white/10"><i data-lucide="pencil" class="h-4 w-4"></i><span>Edit</span></button>`,
      );
    if (message.canDelete)
      items.push(
        `<button type="button" data-message-action="delete-message-for-me" data-message-id="${message.id}" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-white/10"><i data-lucide="trash-2" class="h-4 w-4"></i><span>Delete for me</span></button>`,
      );
    if (message.canUnsend)
      items.push(
        `<button type="button" data-message-action="unsend-message" data-message-id="${message.id}" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-100 hover:bg-rose-500/20"><i data-lucide="undo-2" class="h-4 w-4"></i><span>Unsend</span></button>`,
      );
    if (message.canReply)
      items.push(
        `<button type="button" data-message-action="reply-message" data-message-id="${message.id}" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-white/10"><i data-lucide="reply" class="h-4 w-4"></i><span>Reply</span></button>`,
      );
    items.push(
      `<button type="button" data-message-action="info-message" data-message-id="${message.id}" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-white/10"><i data-lucide="info" class="h-4 w-4"></i><span>Info</span></button>`,
    );
    return `<div data-message-menu="${message.id}" class="relative ml-2 shrink-0"><button type="button" data-message-action="toggle-message-menu" data-message-id="${message.id}" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/80 hover:bg-black/30 hover:text-white"><i data-lucide="more-horizontal" class="h-4 w-4"></i></button>${open ? `<div class="absolute ${message.isOwn ? "right-0" : "left-0"} top-11 z-20 w-52 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl">${items.join("")}</div>` : ""}</div>`;
  }

  function renderThread() {
    const conversation = getActiveConversation();
    if (!conversation) {
      threadHeaderEl.innerHTML =
        '<div class="text-sm text-gray-400">Select a conversation to start messaging.</div>';
      threadBodyEl.innerHTML =
        '<div class="flex h-full items-center justify-center text-center text-sm text-gray-500">Pick someone from the left or search for a user to begin.</div>';
      composeInput.disabled = true;
      sendBtn.disabled = true;
      renderResponsiveLayout();
      return;
    }
    const other = conversation.otherUser || {};
    const messages = state.messagesByConversation[conversation.id] || [];
    const renderRepliedTo = (message) => {
      if (!message.repliedTo) return "";
      return `<div class="mb-2 cursor-pointer rounded-xl border border-white/20 bg-black/20 p-2 text-xs opacity-80 transition-opacity hover:opacity-100" data-message-action="scroll-to-reply" data-target-id="${message.repliedTo.id}"><div class="font-bold text-fuchsia-300">@${escapeHtml(message.repliedTo.senderUsername)}</div><div class="truncate text-white/70">${escapeHtml(message.repliedTo.body || "Attachment")}</div></div>`;
    };
    const activeStatusHtml = state.typingIndicators[Number(conversation.id)]
      ? '<span class="inline-flex items-center gap-1.5 text-emerald-300"><span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>Typing...</span>'
      : formatActiveStatus(other.lastActive);
    threadHeaderEl.innerHTML = `
    <div class="flex w-full items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
            <button type="button" data-message-action="close-active-conversation" class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.08] hover:text-white md:hidden" title="Back to conversations">
                <i data-lucide="chevron-left" class="h-5 w-5"></i>
            </button>
            <img src="${escapeHtml(other.profile_picture_url || defaultAvatar)}" class="h-11 w-11 rounded-full object-cover ring-1 ring-white/10 md:h-12 md:w-12">
            <div class="min-w-0">
                <div class="truncate text-base font-black text-white">${escapeHtml(other.full_name || other.username || "Unknown")}</div>
                <div id="active-chat-status" class="mt-0.5 truncate text-xs text-gray-400">${activeStatusHtml}</div>
            </div>
        </div>
        <div class="flex items-center gap-1">
            <button type="button" data-message-action="clear-conversation" data-conversation-id="${conversation.id}" class="p-2 text-gray-400 transition-colors hover:rounded-full hover:bg-white/10 hover:text-fuchsia-400" title="Clear Chat for me">
                <i data-lucide="eraser" class="h-4 w-4"></i>
            </button>
            <button type="button" data-message-action="delete-conversation" data-conversation-id="${conversation.id}" class="p-2 text-gray-400 transition-colors hover:rounded-full hover:bg-white/10 hover:text-red-500" title="Delete Chat permanently">
                <i data-lucide="trash-2" class="h-4 w-4"></i>
            </button>
            <button type="button" data-message-action="close-active-conversation" class="hidden p-2 text-gray-400 transition-colors hover:rounded-full hover:bg-white/10 hover:text-white md:inline-flex" title="Close conversation">
                <i data-lucide="x" class="h-5 w-5"></i>
            </button>
        </div>
    </div>`;
    composeInput.disabled = false;
    sendBtn.disabled = state.sending;
    const draftText = state.drafts[conversation.id] || "";
    composeInput.value = draftText;
    autosizeComposer();
    renderResponsiveLayout();
    if (draftText.trim().length > 0 && state.socketConnected) {
      const targetUserId = conversation.otherUser?.sql_user_id;
      if (targetUserId && !state.isTyping) {
        state.isTyping = true;
        state.socket.send(
          JSON.stringify({
            type: "typing",
            conversationId: conversation.id,
            targetUserId: targetUserId,
            isTyping: true,
          }),
        );
      }
    }
    if (!messages.length) {
      threadBodyEl.innerHTML =
        '<div class="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">No messages yet. Say hello to start the conversation.</div>';
      renderTypingBubble();
      refreshIcons();
      return;
    }
    threadBodyEl.innerHTML = `<div class="mx-auto flex w-full max-w-3xl flex-col gap-3">${messages.map((message) => `<div class="flex ${message.isOwn ? "justify-end" : "justify-start"}"><div class="flex max-w-[96%] items-start ${message.isOwn ? "flex-row-reverse" : "flex-row"}"><div id="chat-bubble-${message.id}" class="max-w-full rounded-[1.5rem] px-4 py-3 shadow-lg transition-all duration-500 ${message.isOwn ? "bg-fuchsia-600 text-white" : "border border-white/10 bg-white/[0.06] text-white"}">${renderRepliedTo(message)}${renderForwardedFrom(message)}${renderSpecialMessageBody(message)}${renderMessageAttachments(message)}<div class="mt-2 text-[11px] ${message.isOwn ? "text-fuchsia-100/80" : "text-gray-400"}">${escapeHtml(formatTime(message.createdAt))}${message.isEdited ? " (edited)" : ""}${message.isOwn && message.readAt ? " (read)" : ""}</div></div>${renderMessageMenu(message)}</div></div>`).join("")}</div>`;
    renderTypingBubble();
    threadBodyEl.scrollTop = threadBodyEl.scrollHeight;
    refreshIcons();
  }

  function conversationMatchesForwardQuery(conversation, query) {
    if (!query) return true;
    const other = conversation.otherUser || {};
    const text =
      `${other.full_name || ""} ${other.username || ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }

  function renderForwardResults() {
    const sourceMessage = state.forwardingMessageId
      ? getMessageById(state.forwardingMessageId)
      : null;
    if (!forwardPanelEl) return;
    forwardPanelEl.classList.toggle("hidden", !sourceMessage);
    if (!sourceMessage) {
      forwardResultsEl.innerHTML = "";
      if (forwardSearchInput) forwardSearchInput.value = "";
      return;
    }
    const query = String(state.forwardSearchQuery || "")
      .trim()
      .toLowerCase();
    const conversationButtons = state.conversations
      .filter((conversation) =>
        conversationMatchesForwardQuery(conversation, query),
      )
      .map((conversation) => {
        const other = conversation.otherUser || {};
        return `<button type="button" data-message-action="forward-to-conversation" data-message-id="${sourceMessage.id}" data-conversation-id="${conversation.id}" class="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left hover:bg-white/[0.07]"><img src="${escapeHtml(other.profile_picture_url || defaultAvatar)}" class="h-11 w-11 rounded-full object-cover"><div class="min-w-0 flex-1"><div class="truncate text-sm font-bold text-white">${escapeHtml(other.full_name || other.username || "Unknown")}</div><div class="truncate text-xs text-gray-400">Forward to this chat</div></div><span class="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-100">Send</span></button>`;
      });
    const knownIds = new Set(
      state.conversations.map((conversation) =>
        Number(conversation.otherUser?.sql_user_id || 0),
      ),
    );
    const userButtons = (state.forwardSearchResults || [])
      .filter(
        (user) =>
          user && user.sql_user_id && !knownIds.has(Number(user.sql_user_id)),
      )
      .map(
        (user) =>
          `<button type="button" data-message-action="forward-to-user" data-message-id="${sourceMessage.id}" data-user-id="${user.sql_user_id}" class="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left hover:bg-white/[0.06]"><img src="${escapeHtml(user.profile_picture_url || defaultAvatar)}" class="h-11 w-11 rounded-full object-cover"><div class="min-w-0 flex-1"><div class="truncate text-sm font-bold text-white">${escapeHtml(user.full_name || user.username)}</div><div class="truncate text-xs text-gray-400">@${escapeHtml(user.username)}</div></div><span class="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100">New chat</span></button>`,
      );
    const blocks = [];
    if (conversationButtons.length)
      blocks.push(
        `<div class="space-y-2">${conversationButtons.join("")}</div>`,
      );
    if (userButtons.length)
      blocks.push(`<div class="space-y-2">${userButtons.join("")}</div>`);
    forwardResultsEl.innerHTML = blocks.length
      ? blocks.join("")
      : '<div class="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-sky-100/80">No matching chats or users found.</div>';
    refreshIcons();
  }

  async function loadConversations(options = {}) {
    const keepActive = options.keepActive !== false;
    const data = await getJson("/api/messages/conversations");
    state.conversations = Array.isArray(data.conversations)
      ? data.conversations
      : [];
    sortConversations();
    recalcUnread();
    renderConversationList();
    renderForwardResults();
    if (
      keepActive &&
      state.activeConversationId &&
      state.conversations.some(
        (item) => Number(item.id) === Number(state.activeConversationId),
      )
    ) {
      renderThread();
      return;
    }
    const first = state.conversations[0];
    state.activeConversationId = first ? Number(first.id) : null;
    renderThread();
    if (state.activeConversationId)
      await loadMessages(state.activeConversationId, { keepScroll: false });
  }

  async function loadMessages(conversationId, options = {}) {
    if (!conversationId || state.loadingMessages) return;
    state.loadingMessages = true;
    try {
      const data = await getJson(
        `/api/messages/conversations/${conversationId}/messages`,
      );
      state.messagesByConversation[conversationId] = Array.isArray(
        data.messages,
      )
        ? data.messages
        : [];
      if (data.conversation) upsertConversation(data.conversation);
      renderConversationList();
      renderThread();
      renderForwardResults();
      if (!options.keepScroll)
        threadBodyEl.scrollTop = threadBodyEl.scrollHeight;
    } catch (error) {
      showComposeStatus(error.message || "Failed to load messages.", true);
    } finally {
      state.loadingMessages = false;
    }
  }

  async function runUserSearch(query) {
    state.searchQuery = String(query || "").trim();
    if (!state.searchQuery) {
      state.searchResults = [];
      renderSearchResults();
      return;
    }
    try {
      const data = await getJson(
        `/api/users/search?q=${encodeURIComponent(state.searchQuery)}&limit=8`,
      );
      state.searchResults = (
        Array.isArray(data.users) ? data.users : []
      ).filter((user) => user && user.sql_user_id);
    } catch (_e) {
      state.searchResults = [];
    }
    renderSearchResults();
  }

  async function runForwardSearch(query) {
    state.forwardSearchQuery = String(query || "").trim();
    if (!state.forwardSearchQuery) {
      state.forwardSearchResults = [];
      renderForwardResults();
      return;
    }
    try {
      const data = await getJson(
        `/api/users/search?q=${encodeURIComponent(state.forwardSearchQuery)}&limit=8`,
      );
      state.forwardSearchResults = (
        Array.isArray(data.users) ? data.users : []
      ).filter((user) => user && user.sql_user_id);
    } catch (_e) {
      state.forwardSearchResults = [];
    }
    renderForwardResults();
  }

  function openForwardPanel(messageId) {
    const message = getMessageById(messageId);
    if (!message || message.isUnsent) return;
    state.forwardingMessageId = Number(messageId);
    state.openMessageMenuId = null;
    state.forwardSearchQuery = "";
    state.forwardSearchResults = [];
    if (forwardSearchInput) forwardSearchInput.value = "";
    showForwardStatus("Choose a conversation or search for someone.", false);
    renderThread();
    renderForwardResults();
    forwardSearchInput?.focus();
  }

  function closeForwardPanel() {
    state.forwardingMessageId = null;
    state.forwarding = false;
    state.forwardSearchQuery = "";
    state.forwardSearchResults = [];
    if (forwardSearchInput) forwardSearchInput.value = "";
    showForwardStatus("Choose a conversation or search for someone.", false);
    renderForwardResults();
  }

  async function startConversation(userId) {
    const data = await postJson("/api/messages/conversations/start", {
      targetUserId: Number(userId),
    });
    if (!data.conversation) return null;
    upsertConversation(data.conversation);
    state.activeConversationId = Number(data.conversation.id);
    setMobileView("thread");
    renderConversationList();
    renderThread();
    renderForwardResults();
    searchInput.value = "";
    state.searchQuery = "";
    state.searchResults = [];
    renderSearchResults();
    await loadMessages(data.conversation.id, { keepScroll: false });
    composeInput.focus();
    return data.conversation;
  }

  clearReplyBtn?.addEventListener("click", () => {
    state.replyingToMessageId = null;
    replyPreviewEl.classList.add("hidden");
  });

  async function sendMessage() {
    const conversation = getActiveConversation();
    if (!conversation || state.sending) return;
    const body = String(composeInput.value || "").trim();
    if (!body && !state.pendingAttachments.length) {
      showComposeStatus("Write a message or add an attachment.", true);
      return;
    }
    state.sending = true;
    sendBtn.disabled = true;
    showComposeStatus("", false);
    try {
      clearTimeout(state.typingTimer);
      state.isTyping = false;
      let data;
      if (state.pendingAttachments.length) {
        const formData = new FormData();
        formData.append("body", body);
        if (state.replyingToMessageId)
          formData.append("repliedToId", state.replyingToMessageId);
        formData.append(
          "attachmentMeta",
          JSON.stringify(
            state.pendingAttachments.map((item) => ({
              durationSeconds: item.durationSeconds || null,
            })),
          ),
        );
        state.pendingAttachments.forEach((item) =>
          formData.append("attachments", item.file),
        );
        data = await postMultipart(
          `/api/messages/conversations/${conversation.id}/messages`,
          formData,
        );
      } else {
        data = await postJson(
          `/api/messages/conversations/${conversation.id}/messages`,
          {
            body: body,
            repliedToId: state.replyingToMessageId,
          },
        );
      }
      state.replyingToMessageId = null;
      replyPreviewEl?.classList.add("hidden");
      replaceMessageInCache(data.message);
      upsertConversation(data.conversation);
      composeInput.value = "";
      state.drafts[conversation.id] = "";
      autosizeComposer();
      clearPendingAttachments();
      stopTypingSignal();
      renderConversationList();
      renderThread();
    } catch (error) {
      showComposeStatus(error.message || "Failed to send message.", true);
    } finally {
      state.sending = false;
      sendBtn.disabled = false;
    }
  }

  async function editMessage(messageId) {
    const message = getMessageById(messageId);
    if (!message || message.isUnsent) return;
    const nextBody = window.prompt("Edit your message", message.body || "");
    if (nextBody === null) return;
    try {
      const data = await postJson(`/api/messages/messages/${messageId}/edit`, {
        body: nextBody,
      });
      state.openMessageMenuId = null;
      replaceMessageInCache(data.message);
      upsertConversation(data.conversation);
      renderConversationList();
      renderThread();
    } catch (error) {
      showComposeStatus(error.message || "Failed to edit message.", true);
    }
  }

  async function deleteMessageForMe(messageId) {
    const conversation = getActiveConversation();
    if (!conversation) return;
    try {
      const data = await postJson(
        `/api/messages/messages/${messageId}/delete`,
        {},
      );
      state.openMessageMenuId = null;
      removeMessageFromCache(conversation.id, messageId);
      if (data.conversation) upsertConversation(data.conversation);
      renderConversationList();
      renderThread();
    } catch (error) {
      showComposeStatus(error.message || "Failed to delete message.", true);
    }
  }

  async function unsendMessage(messageId) {
    if (!window.confirm("Unsend this message for everyone?")) return;
    try {
      const data = await postJson(
        `/api/messages/messages/${messageId}/unsend`,
        {},
      );
      state.openMessageMenuId = null;
      replaceMessageInCache(data.message);
      upsertConversation(data.conversation);
      renderConversationList();
      renderThread();
      if (Number(state.forwardingMessageId) === Number(messageId))
        closeForwardPanel();
    } catch (error) {
      showComposeStatus(error.message || "Failed to unsend message.", true);
    }
  }

  async function forwardMessage(messageId, payload) {
    if (state.forwarding) return;
    state.forwarding = true;
    showForwardStatus("Forwarding message...", false);
    try {
      const data = await postJson(
        `/api/messages/messages/${messageId}/forward`,
        payload,
      );
      replaceMessageInCache(data.message);
      upsertConversation(data.conversation);
      renderConversationList();
      showForwardStatus("Message forwarded.", false);
      closeForwardPanel();
      if (payload.conversationId) {
        const targetConversationId = Number(payload.conversationId);
        if (Number(state.activeConversationId) === targetConversationId) {
          await loadMessages(targetConversationId, { keepScroll: false });
        }
      }
    } catch (error) {
      showForwardStatus(error.message || "Failed to forward message.", true);
    } finally {
      state.forwarding = false;
    }
  }

  function socketUrl() {
    return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/messages/`;
  }

  function clearSocketReconnect() {
    if (state.socketReconnectTimer) {
      window.clearTimeout(state.socketReconnectTimer);
      state.socketReconnectTimer = null;
    }
  }

  function scheduleSocketReconnect() {
    clearSocketReconnect();
    state.socketReconnectTimer = window.setTimeout(
      () => connectSocket(),
      state.socketReconnectDelayMs,
    );
  }

  async function handleSocketPayload(payload) {
    if (
      !payload?.type ||
      payload.type === "socket.connected" ||
      payload.type === "pong"
    )
      return;
    if (payload.type === "conversation.updated" && payload.conversation) {
      upsertConversation(payload.conversation);
      renderConversationList();
      renderForwardResults();
      if (
        Number(payload.conversation.id) === Number(state.activeConversationId)
      )
        await loadMessages(payload.conversation.id, { keepScroll: true });
      return;
    }
    if (
      payload.type === "message.created" &&
      payload.conversation &&
      payload.message
    ) {
      replaceMessageInCache(payload.message);
      upsertConversation(payload.conversation);
      renderConversationList();
      renderForwardResults();
      if (
        Number(payload.message.conversationId) ===
        Number(state.activeConversationId)
      )
        renderThread();
      return;
    }
    if (
      payload.type === "message.updated" &&
      payload.conversation &&
      payload.message
    ) {
      replaceMessageInCache(payload.message);
      upsertConversation(payload.conversation);
      renderConversationList();
      renderForwardResults();
      if (
        Number(payload.message.conversationId) ===
        Number(state.activeConversationId)
      )
        renderThread();
      return;
    }
    if (payload.type === "message.deleted_for_me" && payload.conversation) {
      removeMessageFromCache(payload.conversationId, payload.messageId);
      upsertConversation(payload.conversation);
      renderConversationList();
      renderForwardResults();
      if (Number(payload.conversationId) === Number(state.activeConversationId))
        renderThread();
      return;
    }
    if (payload.type === "conversation.read") {
      await loadConversations({ keepActive: true });
      if (Number(payload.conversationId) === Number(state.activeConversationId))
        await loadMessages(payload.conversationId, { keepScroll: true });
    }
    if (payload.type === "user.typing") {
      toggleTypingIndicator(payload.conversationId, payload.isTyping);
      return;
    }
    if (payload.type === "messages.read.receipt") {
      const convoId = payload.conversationId;
      const readAtTime = payload.readAt || new Date().toISOString();
      if (state.messagesByConversation[convoId]) {
        state.messagesByConversation[convoId].forEach((msg) => {
          if (msg.isOwn && !msg.readAt) {
            msg.readAt = readAtTime;
          }
        });
      }
      if (Number(state.activeConversationId) === Number(convoId)) {
        renderThread();
      }
      return;
    }
    if (payload.type === "conversation.deleted") {
      const convoId = payload.conversationId;
      state.conversations = state.conversations.filter(
        (c) => Number(c.id) !== Number(convoId),
      );
      delete state.messagesByConversation[convoId];
      if (Number(state.activeConversationId) === Number(convoId)) {
        stopTypingSignal();
        state.activeConversationId = null;
        setMobileView("list");
        renderThread();
      }
      renderConversationList();
      return;
    }
  }

  function connectSocket() {
    if (
      state.socket &&
      (state.socket.readyState === WebSocket.OPEN ||
        state.socket.readyState === WebSocket.CONNECTING)
    )
      return;
    try {
      state.socket = new WebSocket(socketUrl());
    } catch (_e) {
      scheduleSocketReconnect();
      return;
    }
    state.socket.addEventListener("open", () => {
      state.socketConnected = true;
      setLiveStatus();
      clearSocketReconnect();
      renderConversationList();
      state.pingInterval = setInterval(() => {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
          state.socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 15000);
    });
    state.socket.addEventListener("message", (event) => {
      try {
        handleSocketPayload(JSON.parse(event.data || "{}"));
      } catch (_e) {}
    });
    state.socket.addEventListener("close", () => {
      state.socketConnected = false;
      setLiveStatus();
      renderConversationList();
      scheduleSocketReconnect();
      if (state.pingInterval) clearInterval(state.pingInterval);
    });
    state.socket.addEventListener("error", () => {
      state.socketConnected = false;
      setLiveStatus();
    });
  }

  async function startVoiceRecording() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      showComposeStatus("Voice notes are not supported in this browser.", true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      state.recordingChunks = [];
      state.recordingStartedAt = Date.now();
      state.recordingStream = stream;
      state.mediaRecorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0)
          state.recordingChunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const durationSeconds = Math.max(
          1,
          Math.round(
            (Date.now() - (state.recordingStartedAt || Date.now())) / 1000,
          ),
        );
        const blob = new Blob(state.recordingChunks, {
          type: recorder.mimeType || "audio/webm",
        });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        addAttachments([file], { kind: "audio", durationSeconds });
        if (state.recordingStream)
          state.recordingStream.getTracks().forEach((track) => track.stop());
        state.mediaRecorder = null;
        state.recordingStream = null;
        state.recordingChunks = [];
        state.recordingStartedAt = null;
        voiceBtn.classList.remove("bg-rose-600", "border-rose-400/40");
        voiceBtn.classList.add("bg-white/[0.04]", "border-white/10");
        voiceBtn.innerHTML = '<i data-lucide="mic" class="w-4 h-4"></i>';
        showComposeStatus("", false);
        refreshIcons();
      });
      recorder.start();
      voiceBtn.classList.add("bg-rose-600", "border-rose-400/40");
      voiceBtn.classList.remove("bg-white/[0.04]", "border-white/10");
      voiceBtn.innerHTML = '<i data-lucide="square" class="w-4 h-4"></i>';
      showComposeStatus("Recording voice note. Tap again to stop.", false);
      refreshIcons();
    } catch (_e) {
      showComposeStatus("Microphone access is required for voice notes.", true);
    }
  }

  function stopVoiceRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive")
      state.mediaRecorder.stop();
  }

  function openMessages() {
    if (state.opening) return;
    state.opening = true;
    setMobileView(state.activeConversationId ? "thread" : "list");
    modal.classList.remove("hidden");
    requestAnimationFrame(() => {
      modal.classList.remove("opacity-0");
      card.classList.remove("scale-95");
    });
    connectSocket();
    setLiveStatus();
    loadConversations({ keepActive: true })
      .catch((error) => {
        conversationStatusEl.textContent =
          error.message || "Unable to load conversations";
      })
      .finally(() => {
        state.opening = false;
      });
    searchInput.focus();
  }

  function closeMessages() {
    stopTypingSignal();
    modal.classList.add("opacity-0");
    card.classList.add("scale-95");
    window.setTimeout(() => modal.classList.add("hidden"), 200);
    state.openMessageMenuId = null;
    closeForwardPanel();
  }

  document.addEventListener("click", async (event) => {
    const openBtn = event.target.closest('[data-action="open-messages"]');
    if (openBtn) {
      event.preventDefault();
      openMessages();
      return;
    }
    const closeBtn = event.target.closest('[data-action="close-messages"]');
    if (closeBtn || event.target === modal) {
      closeMessages();
      return;
    }
    const menuRoot = event.target.closest("[data-message-menu]");
    const actionEl = event.target.closest("[data-message-action]");
    if (!actionEl) {
      if (!event.target.closest("#message-forward-panel")) closeForwardPanel();
      if (!menuRoot && state.openMessageMenuId !== null) {
        state.openMessageMenuId = null;
        renderThread();
      }
      return;
    }
    const action = actionEl.dataset.messageAction;
    if (action !== "toggle-message-menu") state.openMessageMenuId = null;
    if (action === "toggle-message-menu" && actionEl.dataset.messageId) {
      const nextId = Number(actionEl.dataset.messageId);
      state.openMessageMenuId =
        Number(state.openMessageMenuId) === nextId ? null : nextId;
      renderThread();
      return;
    }
    if (action === "open-conversation" && actionEl.dataset.conversationId) {
      closeForwardPanel();
      stopTypingSignal();
      state.activeConversationId = Number(actionEl.dataset.conversationId);
      setMobileView("thread");
      const convo = state.conversations.find(
        (c) => Number(c.id) === state.activeConversationId,
      );
      if (convo && convo.unreadCount > 0 && state.socketConnected) {
        convo.unreadCount = 0; // Instantly clear the pink unread badge locally
        state.socket.send(
          JSON.stringify({
            type: "messages.read",
            conversationId: convo.id,
            targetUserId: convo.otherUser.sql_user_id,
          }),
        );
      }
      renderConversationList();
      renderThread();
      await loadMessages(state.activeConversationId, { keepScroll: false });
      return;
    }
    if (action === "close-active-conversation") {
      stopTypingSignal();
      if (isMobileLayout()) {
        setMobileView("list");
        renderConversationList();
        return;
      }
      state.activeConversationId = null;
      renderThread();
      renderConversationList();
      return;
    }
    if (action === "start-chat" && actionEl.dataset.userId) {
      stopTypingSignal();
      await startConversation(actionEl.dataset.userId);
      return;
    }
    if (action === "remove-pending-attachment" && actionEl.dataset.localId) {
      const idx = state.pendingAttachments.findIndex(
        (item) => item.localId === actionEl.dataset.localId,
      );
      if (idx >= 0) {
        revokeAttachmentPreview(state.pendingAttachments[idx]);
        state.pendingAttachments.splice(idx, 1);
        renderAttachmentPreview();
      }
      return;
    }
    if (action === "edit-message" && actionEl.dataset.messageId) {
      await editMessage(actionEl.dataset.messageId);
      return;
    }
    if (action === "delete-message-for-me" && actionEl.dataset.messageId) {
      await deleteMessageForMe(actionEl.dataset.messageId);
      return;
    }
    if (action === "unsend-message" && actionEl.dataset.messageId) {
      await unsendMessage(actionEl.dataset.messageId);
      return;
    }
    if (action === "forward-message" && actionEl.dataset.messageId) {
      openForwardPanel(actionEl.dataset.messageId);
      return;
    }
    if (
      action === "forward-to-conversation" &&
      actionEl.dataset.messageId &&
      actionEl.dataset.conversationId
    ) {
      await forwardMessage(actionEl.dataset.messageId, {
        conversationId: Number(actionEl.dataset.conversationId),
      });
      return;
    }
    if (
      action === "forward-to-user" &&
      actionEl.dataset.messageId &&
      actionEl.dataset.userId
    ) {
      const conversation = await startConversation(actionEl.dataset.userId);
      if (conversation?.id)
        await forwardMessage(actionEl.dataset.messageId, {
          conversationId: Number(conversation.id),
        });
    }
    if (action === "reply-message" && actionEl.dataset.messageId) {
      const messageId = actionEl.dataset.messageId;
      const message = getMessageById(messageId);
      if (message) {
        state.replyingToMessageId = message.id;
        replyToUsernameEl.textContent = message.senderUsername;
        replyToBodyEl.textContent = message.body || "Attachment";
        replyPreviewEl.classList.remove("hidden");
        state.openMessageMenuId = null;
        composeInput.focus();
        renderThread();
      }
      return;
    }
    if (action === "info-message" && actionEl.dataset.messageId) {
      const messageId = actionEl.dataset.messageId;
      const message = getMessageById(messageId);
      if (message) {
        const sentTime = message.createdAt
          ? new Date(message.createdAt).toLocaleString()
          : "Unknown";
        const readTime = message.readAt
          ? new Date(message.readAt).toLocaleString()
          : "Not read yet (Delivered)";
        window.alert(`Message Info:\n\nSent: ${sentTime}\nRead: ${readTime}`);
        state.openMessageMenuId = null;
        renderThread();
      }
      return;
    }
    if (action === "scroll-to-reply" && actionEl.dataset.targetId) {
      window.scrollToMessage(actionEl.dataset.targetId);
      return;
    }
    if (action === "clear-conversation" && actionEl.dataset.conversationId) {
      const convoId = actionEl.dataset.conversationId;
      if (
        window.confirm(
          "Are you sure you want to clear this chat? This removes the messages for you, but the other person can still see them.",
        )
      ) {
        try {
          // 1. Tell the server to delete the messages
          postJson(`/api/messages/conversations/${convoId}/clear`, {});

          // 2. Instantly wipe the local cache to make it feel snappy
          state.messagesByConversation[convoId] = [];

          // 3. Redraw the empty thread if we are currently looking at it
          if (Number(state.activeConversationId) === Number(convoId)) {
            renderThread();
          }
        } catch (e) {
          alert(e.message || "Failed to clear chat");
        }
      }
      return;
    }
    if (action === "delete-conversation" && actionEl.dataset.conversationId) {
      const convoId = actionEl.dataset.conversationId;
      if (
        window.confirm(
          "Are you sure you want to permanently delete this conversation? This will remove it for both users and cannot be undone.",
        )
      ) {
        try {
          // We just fire the API request. The WebSocket will automatically handle removing it from the screen!
          postJson(`/api/messages/conversations/${convoId}/delete`, {});
        } catch (e) {
          alert(e.message || "Failed to delete chat");
        }
      }
      return;
    }
  });

  searchInput?.addEventListener("input", () => {
    if (state.searchTimer) window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(
      () => runUserSearch(searchInput.value || ""),
      220,
    );
  });

  forwardSearchInput?.addEventListener("input", () => {
    if (state.forwardSearchTimer) window.clearTimeout(state.forwardSearchTimer);
    state.forwardSearchTimer = window.setTimeout(
      () => runForwardSearch(forwardSearchInput.value || ""),
      220,
    );
  });

  forwardCancelBtn?.addEventListener("click", closeForwardPanel);

  composeInput?.addEventListener("input", () => {
    autosizeComposer();

    const conversation = getActiveConversation();
    if (!conversation) return;

    // 1. Instantly save everything typed to the drafts dictionary
    state.drafts[conversation.id] = composeInput.value;

    // 2. Manage Typing Indicator based entirely on whether the box has text
    if (!state.socketConnected) return;
    const targetUserId = conversation.otherUser?.sql_user_id;
    if (!targetUserId) return;

    const hasText = composeInput.value.trim().length > 0;

    if (hasText && !state.isTyping) {
      state.isTyping = true;
      state.socket.send(
        JSON.stringify({
          type: "typing",
          conversationId: conversation.id,
          targetUserId: targetUserId,
          isTyping: true,
        }),
      );
    } else if (!hasText && state.isTyping) {
      stopTypingSignal();
    }
  });

  composeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  attachBtn?.addEventListener("click", () => attachmentInput?.click());

  attachmentInput?.addEventListener("change", () => {
    addAttachments(Array.from(attachmentInput.files || []));
    attachmentInput.value = "";
  });

  clearPreviewBtn?.addEventListener("click", clearPendingAttachments);

  voiceBtn?.addEventListener("click", () => {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive")
      stopVoiceRecording();
    else startVoiceRecording();
  });

  sendBtn?.addEventListener("click", sendMessage);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      if (state.forwardingMessageId) closeForwardPanel();
      else closeMessages();
    }
  });

  window.scrollToMessage = function (messageId) {
    const bubbleEl = document.getElementById(`chat-bubble-${messageId}`);

    if (!bubbleEl) {
      alert("This message is older and not currently loaded in the chat.");
      return;
    }

    // 1. Scroll smoothly to the center of the screen
    bubbleEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // 2. Save the original styles so we can restore them later
    const originalBoxShadow = bubbleEl.style.boxShadow;
    const originalTransform = bubbleEl.style.transform;
    const originalBg = bubbleEl.style.backgroundColor;

    // 3. Apply a guaranteed-visible highlight
    // This forces a fuchsia tint and a strong glowing shadow, regardless of the original color
    bubbleEl.style.backgroundColor = "rgba(180, 11, 236, 0.93)"; // Fuchsia tint
    bubbleEl.style.boxShadow = "0px 0px 20px 5px rgba(217, 70, 239, 0.6)"; // Neon glow
    bubbleEl.style.transform = "scale(1.02)";

    // 4. Pop the scale back down quickly
    setTimeout(() => {
      bubbleEl.style.transform = "scale(1)";
    }, 300);

    // 5. Fade out the background and glow over 5 seconds
    setTimeout(() => {
      bubbleEl.style.backgroundColor = originalBg;
      bubbleEl.style.boxShadow = originalBoxShadow;
      bubbleEl.style.transform = originalTransform;
    }, 4500);
  };
  connectSocket();
  setLiveStatus();
  loadConversations({ keepActive: false }).catch(() => recalcUnread());
  autosizeComposer();
  renderAttachmentPreview();
  renderForwardResults();
  refreshIcons();
  // --- BACKGROUND PRESENCE UPDATER ---

  function updateAllPresenceUI() {
    renderConversationList();
    if (getActiveConversation()) {
      renderThread();
    }
  }

  async function silentPresencePoll() {
    if (!state.socketConnected || modal.classList.contains("hidden")) return;
    try {
      const data = await getJson("/api/messages/conversations");
      if (Array.isArray(data.conversations)) {
        // Update our local cache with the newest timestamps
        data.conversations.forEach((updatedConvo) => {
          const idx = state.conversations.findIndex(
            (c) => Number(c.id) === Number(updatedConvo.id),
          );
          if (idx >= 0) {
            state.conversations[idx].otherUser.lastActive =
              updatedConvo.otherUser.lastActive;
          }
        });
        // Force the UI to reflect the new times
        updateAllPresenceUI();
      }
    } catch (e) {
      // Fail silently so the user isn't bothered by network blips
    }
  }

  if (typeof mobileViewport.addEventListener === "function") {
    mobileViewport.addEventListener("change", renderResponsiveLayout);
  } else if (typeof mobileViewport.addListener === "function") {
    mobileViewport.addListener(renderResponsiveLayout);
  }

  // Run the silent poll every 15 seconds
  setInterval(silentPresencePoll, 15000);
  renderResponsiveLayout();
})();

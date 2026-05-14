import { useEffect, useCallback, useRef } from "react";

// ======================================================
// Zero-React-render focus system
// Focus changes ONLY manipulate DOM classes directly,
// no React setState, no re-renders, no virtual DOM diff.
// ======================================================

const focusRegistry = new Map(); // id -> { el, row, col, group, onSelect }
let currentFocusId = null;

// Track last nav focus position
let lastNavFocus = "nav-0-0";

// Direct DOM focus update - no React involved
function applyFocus(newId) {
  const prevId = currentFocusId;
  currentFocusId = newId;

  // Remember nav position
  if (newId?.startsWith("nav-")) lastNavFocus = newId;

  // Remove focus from previous element
  if (prevId) {
    const prevEl = focusRegistry.get(prevId)?.el;
    if (prevEl) prevEl.classList.remove("focused");
  }

  // Add focus to new element
  if (newId) {
    const newEl = focusRegistry.get(newId)?.el;
    if (newEl) newEl.classList.add("focused");
  }

  // Notify global listeners (sidebar expand etc)
  globalListeners.forEach((fn) => fn(newId));
}

export function registerFocusable(id, data) {
  focusRegistry.set(id, data);
}

export function unregisterFocusable(id) {
  const item = focusRegistry.get(id);
  if (item?.el) item.el.classList.remove("focused");
  focusRegistry.delete(id);
  if (currentFocusId === id) currentFocusId = null;
}

export function bindFocusableElement(id, el) {
  const item = focusRegistry.get(id);
  if (!item) return;
  item.el = el || null;
  if (el && currentFocusId === id) el.classList.add("focused");
}

export function setFocus(id) {
  if (!focusRegistry.has(id) || id === currentFocusId) return;
  applyFocus(id);
}

export function getCurrentFocusId() {
  return currentFocusId;
}

// Global listeners (minimal - only for things like page switching)
const globalListeners = new Set();
export function onFocusChange(fn) {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

// O(1) grid navigation
function navigateGrid(fromId, direction) {
  const from = focusRegistry.get(fromId);
  if (!from) return null;
  const { row, col, group } = from;

  let tr = row,
    tc = col;
  if (direction === "up") tr--;
  else if (direction === "down") tr++;
  else if (direction === "left") tc--;
  else if (direction === "right") tc++;

  const targetId = `${group}-${tr}-${tc}`;
  if (focusRegistry.has(targetId)) return targetId;

  if (direction === "down" || direction === "up") {
    for (let c = col; c >= 0; c--) {
      const id = `${group}-${tr}-${c}`;
      if (focusRegistry.has(id)) return id;
    }
  }
  return null;
}

function findInGroup(group, preferRow) {
  const id = `${group}-${preferRow}-0`;
  if (focusRegistry.has(id)) return id;
  for (let d = 1; d <= 8; d++) {
    if (focusRegistry.has(`${group}-${preferRow - d}-0`))
      return `${group}-${preferRow - d}-0`;
    if (focusRegistry.has(`${group}-${preferRow + d}-0`))
      return `${group}-${preferRow + d}-0`;
  }
  for (const [id, data] of focusRegistry) {
    if (data.group === group) return id;
  }
  return null;
}

// Keyboard handler
let keyHandler = null;
let customKeyHandler = null;
export function setCustomKeyHandler(handler) {
  customKeyHandler = handler;
}

export function initKeyboardNav() {
  if (keyHandler) return;
  keyHandler = (e) => {
    if (customKeyHandler && customKeyHandler(e)) return;
    const key = e.key;

    if (e.keyCode === 461 || key === "Backspace" || key === "GoBack") {
      e.preventDefault();
      e.stopPropagation();
      const event = new CustomEvent("tv-back", {
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      return;
    }

    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
        key,
      )
    )
      return;
    e.preventDefault();

    if (key === "Enter") {
      if (currentFocusId) focusRegistry.get(currentFocusId)?.onSelect?.();
      return;
    }

    if (!currentFocusId) return;
    const from = focusRegistry.get(currentFocusId);
    if (!from) return;

    const dir = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    }[key];

    // Vertical navigation
    if (dir === "up" || dir === "down") {
      const next = navigateGrid(currentFocusId, dir);
      if (next) {
        setFocus(next);
      } else if (dir === "down" && from.group === "nav") {
        const target = findInGroup("content", 0);
        if (target) setFocus(target);
      } else if (dir === "up" && from.group !== "nav") {
        const target = lastNavFocus || "nav-0-0";
        if (focusRegistry.has(target)) setFocus(target);
        else {
          const found = findInGroup("nav", 0);
          if (found) setFocus(found);
        }
      }
      return;
    }

    // Horizontal navigation
    if (dir === "left" || dir === "right") {
      const next = navigateGrid(currentFocusId, dir);
      if (next) {
        setFocus(next);
      } else if (dir === "left" && from.group !== "nav") {
        const target = lastNavFocus || "nav-0-0";
        if (focusRegistry.has(target)) setFocus(target);
        else {
          const found = findInGroup("nav", 0);
          if (found) setFocus(found);
        }
      }
      return;
    }
  };
  window.addEventListener("keydown", keyHandler);
}

// Hook: registers element, NO re-renders on focus change
export function useFocusable({
  id,
  row = 0,
  col = 0,
  group = "content",
  onSelect,
}) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    registerFocusable(id, {
      row,
      col,
      group,
      onSelect: () => onSelectRef.current?.(),
    });
    return () => unregisterFocusable(id);
  }, [id, row, col, group]);

  const handleClick = useCallback(
    (e) => {
      e.preventDefault();
      setFocus(id);
      onSelectRef.current?.();
    },
    [id],
  );

  const handleMouseEnter = useCallback(() => {
    setFocus(id);
  }, [id]);

  const bindRef = useCallback(
    (el) => {
      bindFocusableElement(id, el);
    },
    [id],
  );

  return {
    isFocused: currentFocusId === id, // Only accurate at render time, not reactive
    props: {
      ref: bindRef,
      "data-focus-id": id,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      style: { cursor: "pointer" },
    },
  };
}

// ============================================
// THE ROYAL CHESS - Premium Chess Game
// A story-driven chess experience with emotions, powers, and magic
// ============================================

class ChessGame {
  constructor() {
    // Game State
    this.board = this.initBoard();
    this.currentPlayer = "white"; // white = Player 1, black = Player 2
    this.gameState = "setup"; // setup, playing, ended
    this.selectedSquare = null;
    this.legalMoves = [];
    this.moveHistory = [];
    this.capturedPieces = { white: [], black: [] };
    this.soundEnabled = true;
    this.lastMove = null;
    this.renderPending = false; // Prevent render flicker
    this.boardInitialized = false; // Track if board DOM exists

    // Game Config
    this.timeLimit = 15 * 60; // seconds
    this.whiteTime = this.timeLimit;
    this.blackTime = this.timeLimit;
    this.timerInterval = null;

    // Player Stats
    this.players = {
      white: { name: "White ♕", personality: "defender" },
      black: { name: "Black ♔", personality: "defender" },
    };

    // Energy & Powers
    this.energy = { white: 0, black: 0 };
    this.maxEnergy = 5;
    this.powersCost = {
      "queen-rush": 3,
      "double-turn": 4,
      teleport: 5,
      "time-freeze": 5,
    };
    this.activePowers = { white: [], black: [] };
    this.timeFreeze = { white: 0, black: 0 };
    this.doubleMove = { active: false, movesMade: 0 };
    this.queenRushActive = false;
    this.teleportActive = false;

    // Game Stats
    this.stats = {
      white: { moves: 0, captures: 0, powersUsed: 0 },
      black: { moves: 0, captures: 0, powersUsed: 0 },
    };

    // Mood System
    this.mood = {
      white: "🔥 Focused",
      black: "😎 Calm",
    };

    this.initializeEventListeners();

    // Online Multiplayer Setup
    this.socket = io();
    this.isOnline = true; // Default to online for this version
    this.localPlayerColor = null; // 'white' or 'black'
    this.room = null;
    this.playerName = null;
    this.opponentName = null;

    // Castling State
    this.hasMoved = {
      white: { king: false, rook_a: false, rook_h: false },
      black: { king: false, rook_a: false, rook_h: false }
    };

    this.positionHistory = new Map();
    this.initializeSocketEvents();
  }

  // ============================================
  // BOARD INITIALIZATION
  // ============================================

  initBoard() {
    return [
      ["r", "n", "b", "q", "k", "b", "n", "r"],
      ["p", "p", "p", "p", "p", "p", "p", "p"],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ["P", "P", "P", "P", "P", "P", "P", "P"],
      ["R", "N", "B", "Q", "K", "B", "N", "R"],
    ];
  }

  // ============================================
  // PIECE MOVEMENT & LEGAL MOVES
  // ============================================

  getPieceColor(piece) {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? "white" : "black";
  }

  getPieceType(piece) {
    return piece ? piece.toLowerCase() : null;
  }

  isLegalMove(fromRow, fromCol, toRow, toCol, testMode = false) {
    const piece = this.board[fromRow][fromCol];
    if (!piece) return false;

    const pieceColor = this.getPieceColor(piece);
    const targetPiece = this.board[toRow][toCol];
    const targetColor = this.getPieceColor(targetPiece);

    // Cannot capture own piece
    if (targetColor === pieceColor) return false;

    const type = this.getPieceType(piece);
    let isLegal = false;

    // If Queen Rush is active, any piece can move like a queen
    if (this.queenRushActive && pieceColor === this.currentPlayer) {
      isLegal = this.isQueenMove(fromRow, fromCol, toRow, toCol);
    } else {
      switch (type) {
        case "p":
          isLegal = this.isPawnMove(fromRow, fromCol, toRow, toCol, pieceColor);
          break;
        case "r":
          isLegal = this.isRookMove(fromRow, fromCol, toRow, toCol);
          break;
        case "n":
          isLegal = this.isKnightMove(fromRow, fromCol, toRow, toCol);
          break;
        case "b":
          isLegal = this.isBishopMove(fromRow, fromCol, toRow, toCol);
          break;
        case "q":
          isLegal = this.isQueenMove(fromRow, fromCol, toRow, toCol);
          break;
        case "k":
          // Prevent infinite recursion: Do not check castling if we are just testing for attacks (testMode)
          isLegal = this.isKingMove(fromRow, fromCol, toRow, toCol, !testMode);
          break;
      }
    }

    if (!isLegal) return false;

    if (!testMode) {
      const tempBoard = this.board.map((row) => [...row]);
      this.board[toRow][toCol] = piece;
      this.board[fromRow][fromCol] = null;

      if (this.isInCheck(pieceColor)) {
        this.board = tempBoard;
        return false;
      }

      this.board = tempBoard;
    }

    return true;
  }

  isPawnMove(fromRow, fromCol, toRow, toCol, color) {
    const direction = color === "white" ? -1 : 1;
    const startRow = color === "white" ? 6 : 1;
    const rowDiff = toRow - fromRow;
    const colDiff = Math.abs(toCol - fromCol);

    // Move forward
    if (colDiff === 0) {
      if (rowDiff === direction && !this.board[toRow][toCol]) return true;
      if (
        fromRow === startRow &&
        rowDiff === 2 * direction &&
        !this.board[toRow][toCol] &&
        !this.board[fromRow + direction][fromCol]
      )
        return true;
    }

    // Capture diagonally
    if (colDiff === 1 && rowDiff === direction && this.board[toRow][toCol])
      return true;

    // En passant
    if (this.lastMove && colDiff === 1 && rowDiff === direction) {
      const [lastFrom, lastTo] = this.lastMove;
      if (
        lastTo[0] === fromRow &&
        lastTo[1] === toCol &&
        this.getPieceType(this.board[fromRow][toCol]) === "p" &&
        this.getPieceColor(this.board[fromRow][toCol]) !== color &&
        Math.abs(lastFrom[0] - lastTo[0]) === 2
      )
        return true;
    }

    return false;
  }

  isRookMove(fromRow, fromCol, toRow, toCol) {
    if (fromRow !== toRow && fromCol !== toCol) return false;
    return this.isPathClear(fromRow, fromCol, toRow, toCol);
  }

  isBishopMove(fromRow, fromCol, toRow, toCol) {
    if (Math.abs(fromRow - toRow) !== Math.abs(fromCol - toCol)) return false;
    return this.isPathClear(fromRow, fromCol, toRow, toCol);
  }

  isKnightMove(fromRow, fromCol, toRow, toCol) {
    const rowDiff = Math.abs(fromRow - toRow);
    const colDiff = Math.abs(fromCol - toCol);
    return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
  }

  isQueenMove(fromRow, fromCol, toRow, toCol) {
    return (
      this.isRookMove(fromRow, fromCol, toRow, toCol) ||
      this.isBishopMove(fromRow, fromCol, toRow, toCol)
    );
  }

  isKingMove(fromRow, fromCol, toRow, toCol, allowCastling = true) {
    const rowDiff = Math.abs(fromRow - toRow);
    const colDiff = Math.abs(fromCol - toCol);

    // Normal King Move
    if (rowDiff <= 1 && colDiff <= 1) {
      // Kings cannot be adjacent to each other
      const piece = this.board[fromRow][fromCol];
      const color = this.getPieceColor(piece);
      const opponentColor = color === "white" ? "black" : "white";
      const opponentKingPos = this.findKing(opponentColor);
      if (opponentKingPos) {
        const distR = Math.abs(toRow - opponentKingPos[0]);
        const distC = Math.abs(toCol - opponentKingPos[1]);
        if (distR <= 1 && distC <= 1) return false;
      }
      return true;
    }

    // Castling
    if (allowCastling && rowDiff === 0 && colDiff === 2) {
      // Castling logic only applies to normal king, not when checking for attacks (testMode=true)
      return this.isCastlingMove(fromRow, fromCol, toRow, toCol);
    }

    return false;
  }

  isCastlingMove(fromRow, fromCol, toRow, toCol) {
    if (this.isInCheck(this.currentPlayer)) return false;

    const color = this.getPieceColor(this.board[fromRow][fromCol]);
    const isWhite = color === 'white';
    const row = isWhite ? 7 : 0;

    // Validate row (must be home rank)
    if (fromRow !== row) return false;

    // Check Has Moved
    if (this.hasMoved[color].king) return false;

    // King Side (g-file)
    if (toCol === 6) {
      if (this.hasMoved[color].rook_h) return false;
      if (this.board[row][5] || this.board[row][6]) return false; // Path blocked
      // Check if crossing check
      if (this.isSquareAttacked(row, 5, isWhite ? 'black' : 'white')) return false;
      if (this.isSquareAttacked(row, 6, isWhite ? 'black' : 'white')) return false;
      return true;
    }

    // Queen Side (c-file)
    if (toCol === 2) {
      if (this.hasMoved[color].rook_a) return false;
      if (this.board[row][1] || this.board[row][2] || this.board[row][3]) return false;
      // Check if crossing check
      if (this.isSquareAttacked(row, 3, isWhite ? 'black' : 'white')) return false;
      if (this.isSquareAttacked(row, 2, isWhite ? 'black' : 'white')) return false;
      return true;
    }

    return false;
  }

  isSquareAttacked(row, col, attackerColor) {
    // Iterate all squares, find pieces of attackerColor, check if they can move to (row, col)
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && this.getPieceColor(piece) === attackerColor) {
          // Use testMode=true for isLegalMove to avoid recursion
          // However, isLegalMove checks if move exposes OWN king
          // We just want to know if this piece can CAPTURE at (row, col)
          // isLegalMove calls isPawnMove etc. 

          // Optimization: Call specific move check based on piece type directly?
          // No, Stick to isLegalMove(..., true) which calls checks + pseudo-legal
          // BUT isLegalMove checks if target is same color (it's not, or empty).
          // If empty, pawns can't capture.
          // Pawns attack diagonally. isPawnMove handles capture if target is present.
          // If target is empty (for castling crossing), pawn won't return true for diagonal move unless En Passant.

          // Special Case for Pawns: they attack diagonals regardless of occupancy
          const type = this.getPieceType(piece);
          if (type === 'p') {
            const direction = attackerColor === 'white' ? -1 : 1;
            if (Math.abs(col - c) === 1 && (row - r) === direction) return true;
          } else {
            // For other pieces, enable a "captureMode" or mock the board?
            // Actually, isLegalMove(r, c, row, col, true) checks if it can move there.
            // If (row, col) is empty, R/B/Q/N/K can move there if path clear.
            // So isLegalMove is fine for them.
            if (this.isLegalMove(r, c, row, col, true)) return true;
          }
        }
      }
    }
    return false;
  }

  findKing(color) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (
          piece &&
          this.getPieceType(piece) === "k" &&
          this.getPieceColor(piece) === color
        ) {
          return [row, col];
        }
      }
    }
    return null;
  }

  isPathClear(fromRow, fromCol, toRow, toCol) {
    const rowStep = Math.sign(toRow - fromRow);
    const colStep = Math.sign(toCol - fromCol);
    let row = fromRow + rowStep;
    let col = fromCol + colStep;

    while (row !== toRow || col !== toCol) {
      if (this.board[row][col]) return false;
      row += rowStep;
      col += colStep;
    }

    return true;
  }

  getLegalMoves(row, col) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.isLegalMove(row, col, r, c)) moves.push([r, c]);
      }
    }
    return moves;
  }


  isInCheck(color) {
    const kingPos = this.findKing(color);
    if (!kingPos) return false;

    const [kingRow, kingCol] = kingPos;
    const opponentColor = color === "white" ? "black" : "white";

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && this.getPieceColor(piece) === opponentColor) {
          if (this.isLegalMove(r, c, kingRow, kingCol, true)) return true;
        }
      }
    }
    return false;
  }

  isCheckmate(color) {
    if (!this.isInCheck(color)) return false;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && this.getPieceColor(piece) === color) {
          if (this.getLegalMoves(r, c).length > 0) return false;
        }
      }
    return true;
  }

  isStalemate(color) {
    if (this.isInCheck(color)) return false;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && this.getPieceColor(piece) === color) {
          if (this.getLegalMoves(r, c).length > 0) return false;
        }
      }
    return true;
  }

  // ============================================
  // MOVE PIECES
  // ============================================

  movePiece(fromRow, fromCol, toRow, toCol, isRemote = false) {
    const piece = this.board[fromRow][fromCol];
    const captured = this.board[toRow][toCol];
    const pieceColor = this.getPieceColor(piece);

    // CANNOT CAPTURE KING - Only checkmate
    if (captured && this.getPieceType(captured) === "k") {
      return false; // Cannot capture king - must be checkmate
    }



    // En passant
    if (this.getPieceType(piece) === "p" && !captured && fromCol !== toCol) {
      const capturedRow = fromRow;
      const capturedPiece = this.board[capturedRow][toCol];
      if (capturedPiece) {
        this.board[capturedRow][toCol] = null;
        const capturedColor = this.getPieceColor(capturedPiece);
        this.capturedPieces[capturedColor].push(capturedPiece);
        this.addEnergy(pieceColor, 1);
        this.stats[pieceColor].captures++;
        this.playSound("capture");
      }
    }

    // Normal capture
    if (captured) {
      const capturedColor = this.getPieceColor(captured);
      this.capturedPieces[capturedColor].push(captured);
      this.stats[pieceColor].captures++;
      this.addEnergy(pieceColor, 1);
      this.playSound("capture");

      // Romantic Easter Egg
      if (this.isRomanticName(this.players[pieceColor].name)) {
        this.triggerRomanticMessage("capture", this.players[pieceColor].name);
      }
    }

    // Move
    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;

    // Castling Move Execution
    if (this.getPieceType(piece) === 'k' && Math.abs(fromCol - toCol) === 2) {
      // King side
      if (toCol > fromCol) {
        const rook = this.board[fromRow][7];
        this.board[fromRow][5] = rook;
        this.board[fromRow][7] = null;
        this.hasMoved[pieceColor].rook_h = true;
      }
      // Queen side
      else {
        const rook = this.board[fromRow][0];
        this.board[fromRow][3] = rook;
        this.board[fromRow][0] = null;
        this.hasMoved[pieceColor].rook_a = true;
      }
    }

    // Update Has Moved State
    if (this.getPieceType(piece) === 'k') {
      this.hasMoved[pieceColor].king = true;
    } else if (this.getPieceType(piece) === 'r') {
      if (fromCol === 0) this.hasMoved[pieceColor].rook_a = true;
      if (fromCol === 7) this.hasMoved[pieceColor].rook_h = true;
    }

    // Pawn promotion
    if (
      this.getPieceType(piece) === "p" &&
      ((pieceColor === "white" && toRow === 0) ||
        (pieceColor === "black" && toRow === 7))
    ) {
      return "promotion";
    }

    // Record move
    this.lastMove = [
      [fromRow, fromCol],
      [toRow, toCol],
    ];
    this.moveHistory.push(this.lastMove);
    this.addToHistory(fromRow, fromCol, toRow, toCol, piece);
    this.stats[pieceColor].moves++;

    this.playSound("move");

    // Romantic Easter Egg - Random chance REMOVED as per user request
    // if (this.isRomanticName(this.players[pieceColor].name) && Math.random() < 0.1 && !captured) {
    //    this.triggerRomanticMessage("anytime", this.players[pieceColor].name);
    // }

    if (this.isOnline && !isRemote) {
      this.socket.emit('move', {
        from: [fromRow, fromCol],
        to: [toRow, toCol],
        promotion: null,
        time: pieceColor === 'white' ? this.whiteTime : this.blackTime
      });
    }
    return "success";
  }

  // ============================================
  // ENERGY & POWERS
  // ============================================

  addEnergy(color, amount) {
    const energyGain = amount; // يمكن تعديل حسب الشخصية لاحقاً
    this.energy[color] = Math.max(0, Math.min(
      this.energy[color] + energyGain,
      this.maxEnergy,
    ));
    this.updateEnergyBar();
  }

  canActivatePower(color, power) {
    return this.energy[color] >= this.powersCost[power];
  }

  activatePower(color, power, row = null, col = null, isRemote = false) {
    if (!this.canActivatePower(color, power)) return false;
    
    // Deduct energy
    this.energy[color] -= this.powersCost[power];
    this.stats[color].powersUsed++;
    this.activePowers[color].push(power);
    
    // Activate Game State Logic
    switch (power) {
        case "queen-rush":
            this.queenRushActive = true;
            break;
        case "double-turn":
            this.doubleMove.active = true;
            this.doubleMove.movesMade = 0;
            break;
        case "teleport":
            this.teleportActive = true;
            break;
        case "time-freeze":
            // Freeze CURRENT player's time for 3 minutes (180000 ms)
            this.timeFreeze[color] = Date.now() + 180000;
            break;
    }

    this.playSound("power");

    if (this.isOnline && !isRemote) {
      this.socket.emit('power', { power, row, col });
    }

    return true;
  }

  // ============================================
  // MOOD
  // ============================================

  updateMood(color) {
    const inCheck = this.isInCheck(color);
    const captureRatio =
      this.stats[color].moves > 0
        ? this.capturedPieces[color].length / this.stats[color].moves
        : 0;

    if (inCheck) this.mood[color] = "😤 Under Pressure";
    else if (captureRatio > 0.3) this.mood[color] = "🔥 Focused";
    else this.mood[color] = "😎 Calm";

    this.renderGameHeader();
  }

  // ============================================
  // RENDERING
  // ============================================

    renderBoard() {
    const boardEl = document.getElementById("chessBoard");
    if (!boardEl) return;

    // Flip board for black player in online mode
    const shouldFlip = this.isOnline && this.localPlayerColor === 'black';

    // Iterate 8x8. If board is empty, create squares. If exists, update them.
    const isFirstRender = boardEl.children.length === 0;

    if (isFirstRender) {
      boardEl.innerHTML = ""; // Ensure clean state
    }

    // Helper to get or create square
    const getSquare = (row, col, index) => {
        if (isFirstRender) {
             const sq = document.createElement("div");
             sq.className = "chess-square";
             // set coords once
             sq.dataset.row = row;
             sq.dataset.col = col;
             
             // Add event listeners ONCE
             const handler = (e) => {
                 e.preventDefault();
                 const r = parseInt(e.currentTarget.dataset.row);
                 const c = parseInt(e.currentTarget.dataset.col);
                 this.handleSquareClick(r, c);
             };

             if (window.PointerEvent) {
                sq.addEventListener("pointerdown", handler);
              } else {
                sq.addEventListener("touchstart", handler);
                sq.addEventListener("click", handler);
              }
             return sq;
        } else {
            // In update mode, relies on order or dataset. 
            // Since we always iterate same order (based on flip), referencing by index is safest for order matching 
            // OR querySelector. querySelector is safer if order changes (but logic above keeps order consistent).
            // Let's use the child at index to be fast.
            return boardEl.children[index];
        }
    }

    // Iterate loops based on perspective
    const rowStart = shouldFlip ? 7 : 0;
    const rowEnd = shouldFlip ? -1 : 8;
    const rowStep = shouldFlip ? -1 : 1;

    const colStart = shouldFlip ? 7 : 0;
    const colEnd = shouldFlip ? -1 : 8;
    const colStep = shouldFlip ? -1 : 1;

    let childIndex = 0;
    const fragment = isFirstRender ? document.createDocumentFragment() : null;

    for (let row = rowStart; row !== rowEnd; row += rowStep) {
      for (let col = colStart; col !== colEnd; col += colStep) {
         
        const square = getSquare(row, col, childIndex);
        
        // 1. UPDATE CLASSES
        // Base class
        const isLight = (row + col) % 2 === 0;
        let newClass = `chess-square ${isLight ? "light" : "dark"}`;

        // Selected
        if (
            this.selectedSquare &&
            this.selectedSquare[0] === row &&
            this.selectedSquare[1] === col
        ) {
            newClass += " selected";
        }

        // Legal Moves / Captures
        if (this.legalMoves.some((m) => m[0] === row && m[1] === col)) {
            const target = this.board[row][col];
            newClass += target ? " legal-capture" : " legal-move";
        }

        // Last Move
        if (this.lastMove) {
            const [from, to] = this.lastMove;
            if (
            (row === from[0] && col === from[1]) ||
            (row === to[0] && col === to[1])
            ) {
            newClass += " last-move";
            }
        }

        // APPLY CLASS only if changed (optional optim, but assigning string is fast)
        if (square.className !== newClass) {
            square.className = newClass;
        }

        // 2. UPDATE PIECE CONTENT
        const piece = this.board[row][col];
        const currentPieceEl = square.firstElementChild;
        
        if (piece) {
            const color = this.getPieceColor(piece);
            const pieceClass = `chess-piece ${color === "white" ? "white-piece" : "black-piece"}`;
            const symbol = this.getPieceUnicode(piece);

            if (currentPieceEl) {
                // Update existing piece
                if (currentPieceEl.className !== pieceClass) currentPieceEl.className = pieceClass;
                if (currentPieceEl.textContent !== symbol) currentPieceEl.textContent = symbol;
            } else {
                // Create new piece
                const pieceEl = document.createElement("div");
                pieceEl.className = pieceClass;
                pieceEl.textContent = symbol;
                square.appendChild(pieceEl);
            }
        } else {
            // No piece, remove if exists
            if (currentPieceEl) {
                square.innerHTML = "";
            }
        }

        // 3. Ensure Dataset (redundant check for robustness)
        if (square.dataset.row != row) square.dataset.row = row;
        if (square.dataset.col != col) square.dataset.col = col;

        if (isFirstRender) {
            fragment.appendChild(square);
        }
        
        childIndex++;
      }
    }

    if (isFirstRender) {
        boardEl.appendChild(fragment);
    }
  }

  renderGameHeader() {
    // Vertically stacked timers
    const whiteTimerCard = document.getElementById("whiteTimerCard");
    const blackTimerCard = document.getElementById("blackTimerCard");
    const whiteTimerDisplay = document.getElementById("whiteTimer");
    const blackTimerDisplay = document.getElementById("blackTimer");
    const whiteNameDisplay = document.getElementById("whitePlayerName");
    const blackNameDisplay = document.getElementById("blackPlayerName");
    const turnIndicator = document.getElementById("turnIndicator");

    if (whiteTimerDisplay) whiteTimerDisplay.textContent = this.formatTime(this.whiteTime);
    if (blackTimerDisplay) blackTimerDisplay.textContent = this.formatTime(this.blackTime);

    if (whiteNameDisplay) {
        whiteNameDisplay.textContent = this.players.white.name || "White ♕";
    }
    if (blackNameDisplay) {
        blackNameDisplay.textContent = this.players.black.name || "Black ♔";
    }

    if (turnIndicator) {
      turnIndicator.textContent = `${this.currentPlayer === "white" ? "WHITE" : "BLACK"}'S TURN`;
    }

    // Toggle active class on cards
    if (whiteTimerCard && blackTimerCard) {
      if (this.currentPlayer === "white") {
        whiteTimerCard.classList.add("active");
        blackTimerCard.classList.remove("active");
      } else {
        whiteTimerCard.classList.remove("active");
        blackTimerCard.classList.add("active");
      }
    }

    // Flip UI for local player so their timer is always at the bottom
    const timersStack = document.querySelector('.timers-stack');
    if (timersStack) {
      if (this.localPlayerColor === 'white') {
        timersStack.classList.add('flipped-stack');
      } else {
        timersStack.classList.remove('flipped-stack');
      }
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    
    const sounds = {
      move: "moveSound",
      capture: "captureSound",
      power: "powerSound",
    };
    const audio = document.getElementById(sounds[type]);
    if (audio) {
      audio.muted = false;
      audio.currentTime = 0;
      audio.play().catch((error) => {
        // fail silently
      });
    }
  }

  getPieceUnicode(piece) {
    const map = {
      p: "♟",
      P: "♙",
      r: "♜",
      R: "♖",
      n: "♞",
      N: "♘",
      b: "♝",
      B: "♗",
      q: "♛",
      Q: "♕",
      k: "♚",
      K: "♔",
    };
    return map[piece] || "";
  }

  updateEnergyBar() {
    // Determine which energy to show on the main bar
    let energyToShow = this.energy[this.currentPlayer];

    // If online player, show MY energy always (so I can see if I can afford things even on opponent turn)
    if (this.isOnline && this.localPlayerColor && this.localPlayerColor !== 'spectator') {
        energyToShow = this.energy[this.localPlayerColor];
    }

    // Update energy fill bar
    const energyFill = document.getElementById("energyFill");
    const energyCount = document.getElementById("energyCount");
    if (energyFill && energyCount) {
      const percentage =
        (energyToShow / this.maxEnergy) * 100;
      energyFill.style.width = percentage + "%";
      energyCount.textContent = `${Math.floor(energyToShow)} / ${this.maxEnergy}`;
    }

    // Update Timer Card Energy
    const whiteEnergyCard = document.getElementById("whiteEnergyCard");
    const blackEnergyCard = document.getElementById("blackEnergyCard");
    if (whiteEnergyCard) whiteEnergyCard.textContent = Math.floor(this.energy.white);
    if (blackEnergyCard) blackEnergyCard.textContent = Math.floor(this.energy.black);

    // Update stats
    this.updateStats();
  }

  updateStats() {
    // Update White's stats
    const whiteMoves = document.getElementById("whiteMoves");
    const whiteCaptures = document.getElementById("whiteCaptures");
    const whitePowers = document.getElementById("whitePowers");

    if (whiteMoves) whiteMoves.textContent = this.stats.white.moves;
    if (whiteCaptures) whiteCaptures.textContent = this.stats.white.captures;
    if (whitePowers) whitePowers.textContent = this.stats.white.powersUsed;

    // Update Black's stats
    const blackMoves = document.getElementById("blackMoves");
    const blackCaptures = document.getElementById("blackCaptures");
    const blackPowers = document.getElementById("blackPowers");

    if (blackMoves) blackMoves.textContent = this.stats.black.moves;
    if (blackCaptures) blackCaptures.textContent = this.stats.black.captures;
    if (blackPowers) blackPowers.textContent = this.stats.black.powersUsed;
  }

  // ============================================
  // SQUARE CLICK HANDLER
  // ============================================

  handleSquareClick(row, col) {
    if (this.isOnline && this.currentPlayer !== this.localPlayerColor) {
      return; // Not your turn
    }
    // Block input during AI turn
    if (this.gameMode === 'ai' && this.currentPlayer === 'black') {
      return;
    }
    const piece = this.board[row][col];
    let shouldRender = false;

    // SHIELD POWER - Select piece to protect
    // REMOVED

    // QUEEN RUSH POWER
    if (this.queenRushActive && this.selectedSquare) {
      const [fromRow, fromCol] = this.selectedSquare;
      if (this.isLegalMove(fromRow, fromCol, row, col)) {
        const result = this.movePiece(fromRow, fromCol, row, col);

        if (result === "promotion") {
          this.promotionData = { fromRow, fromCol, row, col };
          document.getElementById("promotionModal").classList.remove("hidden");
          this.queenRushActive = false;
          this.selectedSquare = null;
          const banner = document.getElementById("activePowerBanner");
          if (banner) banner.style.display = "none";
          this.renderBoard();
          return;
        }

        if (!this.doubleMove.active) {
          this.switchPlayer();
          this.queenRushActive = false;
          const banner = document.getElementById("activePowerBanner");
          if (banner) banner.style.display = "none";
        } else {
          this.doubleMove.movesMade++;
          if (this.doubleMove.movesMade >= 2) {
            this.doubleMove.active = false;
            this.doubleMove.movesMade = 0;
            this.queenRushActive = false;
            const banner = document.getElementById("activePowerBanner");
            if (banner) banner.style.display = "none";
            this.switchPlayer();
          }
        }
      }
      this.selectedSquare = null;
      this.renderBoard();
      this.updateEnergyBar();
      return;
    }

    // TELEPORT POWER
    if (this.teleportActive && this.selectedSquare) {
      const [fromRow, fromCol] = this.selectedSquare;
      // Can only teleport to empty square or capture opponent piece
      if (!piece || this.getPieceColor(piece) !== this.currentPlayer) {
        const teleportPiece = this.board[fromRow][fromCol];
        const pieceType = this.getPieceType(teleportPiece);
        const pieceColor = this.getPieceColor(teleportPiece);

        // Safeguard: Kings cannot be adjacent via teleport
        if (pieceType === 'k') {
          const opponentColor = pieceColor === 'white' ? 'black' : 'white';
          const opponentKingPos = this.findKing(opponentColor);
          if (opponentKingPos) {
            const distR = Math.abs(row - opponentKingPos[0]);
            const distC = Math.abs(col - opponentKingPos[1]);
            if (distR <= 1 && distC <= 1) {
              this.addChatMessage("System", "🚫 Kings cannot be adjacent!");
              this.selectedSquare = null;
              this.teleportActive = false;
              const banner = document.getElementById("activePowerBanner");
              if (banner) banner.style.display = "none";
              this.renderBoard();
              return;
            }
          }
        }

        const targetPiece = this.board[row][col];

        // Capture if needed
        if (targetPiece) {
          const capturedColor = this.getPieceColor(targetPiece);
          this.capturedPieces[capturedColor].push(targetPiece);
          this.stats[this.currentPlayer].captures++;
          this.addEnergy(this.currentPlayer, 1);
          this.playSound("capture");
        }

        this.board[row][col] = teleportPiece;
        this.board[fromRow][fromCol] = null;
        this.lastMove = [
          [fromRow, fromCol],
          [row, col],
        ];
        this.moveHistory.push(this.lastMove);
        this.stats[this.currentPlayer].moves++;
        this.playSound("move");

        // Check for promotion after teleport
        if (this.getPieceType(teleportPiece) === "p" && (row === 0 || row === 7)) {
          this.promotionData = { fromRow, fromCol, row, col, isTeleport: true };
          document.getElementById("promotionModal").classList.remove("hidden");
          this.renderBoard();
          return;
        }

        if (this.isOnline) {
          this.socket.emit('move', {
            from: [fromRow, fromCol],
            to: [row, col],
            promotion: null,
            time: this.currentPlayer === 'white' ? this.whiteTime : this.blackTime
          });
        }

        if (!this.doubleMove.active) {
          this.switchPlayer();
        } else {
          this.doubleMove.movesMade++;
          if (this.doubleMove.movesMade >= 2) {
            this.doubleMove.active = false;
            this.doubleMove.movesMade = 0;
            this.switchPlayer();
          }
        }

        // Check for end game
        const playerToMove = this.currentPlayer;
        const opponent = playerToMove === "white" ? "black" : "white";
        if (this.isCheckmate(playerToMove)) {
          this.endGame(opponent);
          this.renderBoard();
          this.updateEnergyBar();
          return;
        }
        if (this.isStalemate(playerToMove)) {
          this.endGame("draw");
          this.renderBoard();
          this.updateEnergyBar();
          return;
        }

        this.updateMood("white");
        this.updateMood("black");
        this.renderBoard();
        this.updateEnergyBar();
      }
      return;
    }

    if (piece && this.getPieceColor(piece) === this.currentPlayer) {
      this.selectedSquare = [row, col];
      this.legalMoves = this.getLegalMoves(row, col);
      shouldRender = true;
    } else if (this.selectedSquare) {
      const [fromRow, fromCol] = this.selectedSquare;
      if (this.isLegalMove(fromRow, fromCol, row, col)) {
        const result = this.movePiece(fromRow, fromCol, row, col);

        // If movePiece returns false (e.g., shielded piece), the move is blocked
        if (result === false) {
           // Move blocked (likely invalid for some reason if isLegalMove passed)
           this.selectedSquare = null;
           this.renderBoard();
           return;
        }

        this.selectedSquare = null;
        this.legalMoves = [];

        if (result === "promotion") {
          // Show promotion modal instead of auto-promoting
          this.promotionData = { fromRow, fromCol, row, col };
          document.getElementById("promotionModal").classList.remove("hidden");
          this.updateMood("white");
          this.updateMood("black");
          this.renderBoard();
          this.updateEnergyBar();
          return; // Wait for player to choose piece
        }

        if (!this.doubleMove.active) this.switchPlayer();
        else this.doubleMove.movesMade++;

        if (this.doubleMove.active && this.doubleMove.movesMade >= 2) {
          this.doubleMove.active = false;
          this.doubleMove.movesMade = 0;
          this.switchPlayer();
        }

        // After the move and any player switching, check for checkmate, stalemate, or repetition
        this.runCheckDetection();

        shouldRender = true;
      }
    }

    if (shouldRender) {
      this.updateMood("white");
      this.updateMood("black");
      this.renderBoard();
      this.updateEnergyBar();
    }
  }

  // ============================================
  // PLAYER MANAGEMENT
  // ============================================

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === "white" ? "black" : "white";
    this.updateEnergyBar();
    this.renderGameHeader();

    // AI Trigger
    if (this.gameMode === 'ai' && this.currentPlayer === 'black') {
      this.makeAIMove();
    }
  }

  initializeEventListeners() {
    // START GAME BUTTON (Join/Matchmaking/AI logic handled in initializeSocketEvents)

    // OPEN CHAT / VIEW STATS OVERLAYS
    const openChatBtn = document.getElementById("openChatBtn");
    if (openChatBtn) {
      openChatBtn.addEventListener("click", () => {
        document.getElementById("chatOverlay").classList.remove("hidden");
      });
    }

    const viewStatsBtn = document.getElementById("viewStatsBtn");
    if (viewStatsBtn) {
      viewStatsBtn.addEventListener("click", () => {
        document.getElementById("statsOverlay").classList.remove("hidden");
        this.updateStats();
      });
    }

    // SOUND TOGGLE
    const soundToggle = document.getElementById("soundToggle");
    if (soundToggle) {
      soundToggle.addEventListener("click", () => {
        this.soundEnabled = !this.soundEnabled;
        soundToggle.textContent = this.soundEnabled ? "🔊" : "🔇";
      });
    }

    // CHAT FEATURES
    const sendMsg = document.getElementById("sendMsg");
    const chatInput = document.getElementById("chatInput");
    if (sendMsg) {
      sendMsg.addEventListener("click", () => this.sendMessage());
    }
    if (chatInput) {
      chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.sendMessage();
      });
    }

    // EMOJI REACTIONS
    document.querySelectorAll(".emoji-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.addEmoji(e.target.dataset.emoji);
      });
    });

    // POWER BUTTONS (Modern Cards)
    document.querySelectorAll(".power-card").forEach((item) => {
      item.addEventListener("click", () => this.handlePowerClick(item));
    });

    // COMBO BUTTON
    // COMBO BUTTON REMOVED

    // UNDO BUTTON
    const undoBtn = document.getElementById("undoBtn");
    if (undoBtn) {
      undoBtn.addEventListener("click", () => this.undoMove());
    }

    const forfeitBtn = document.getElementById("forfeitBtn");
    if (forfeitBtn) {
      forfeitBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to resign?")) {
          if (this.isOnline) {
            this.socket.emit("resign");
          }
          this.endGame("opponent"); // End game and let opponent win
        }
      });
    }

    // REMATCH BUTTON
    const rematchBtn = document.getElementById("rematchBtn");
    if (rematchBtn) {
      rematchBtn.addEventListener("click", () => {
        if (this.isOnline) {
          this.socket.emit("rematch_request");
          rematchBtn.textContent = "WAITING...";
        } else {
          this.resetGame();
        }
      });
    }

    // SETTINGS BUTTON (Used as "Main Menu" / "Exit")
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
        this.returnToSetup();
    });
  }

  // MODAL CLOSES (Simple handling)
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal")) {
        e.target.classList.add("hidden");
      }
    });

    // PROMOTION MODAL
    document.querySelectorAll(".promotion-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.promotePawn(btn.dataset.piece),
      );
    });

    // REDIRECT BUTTONS
    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn) profileBtn.addEventListener("click", () => {
      document.getElementById("profileModal").classList.remove("hidden");
      this.loadProfile();
    });

    const leaderboardBtn = document.getElementById("leaderboardBtn");
    if (leaderboardBtn) leaderboardBtn.addEventListener("click", () => {
      document.getElementById("leaderboardModal").classList.remove("hidden");
    });

    // PWA INSTALL LOGIC
    const pwaBtn = document.getElementById("pwaInstallBtn");
    const iosModal = document.getElementById("iosInstallModal"); 
    let deferredPrompt;

    // A. Check for iOS
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    // Show button if iOS and NOT already installed
    if (isIos && !isStandalone && pwaBtn) {
        pwaBtn.classList.remove("hidden");
        pwaBtn.addEventListener("click", () => {
            iosModal.classList.remove("hidden");
        });
        document.getElementById("closeIosInstallBtn").addEventListener("click", () => {
            iosModal.classList.add("hidden");
        });
    }

    // B. Check for Android/Desktop (beforeinstallprompt)
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67+ from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to notify the user they can add to home screen
        if (pwaBtn) {
            pwaBtn.classList.remove("hidden");
            pwaBtn.addEventListener("click", () => {
                // Hide our user interface that shows either the A2HS button or link
                pwaBtn.style.display = 'none';
                // Show the prompt
                deferredPrompt.prompt();
                // Wait for the user to respond to the prompt
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('User accepted the A2HS prompt');
                    } else {
                        console.log('User dismissed the A2HS prompt');
                    }
                    deferredPrompt = null;
                });
            });
        }
    });

    // C. Check if already installed
    window.addEventListener('appinstalled', () => {
        // Log install to analytics
        console.log('INSTALL: Success');
        if (pwaBtn) pwaBtn.style.display = 'none';
    });
  }

  // ============================================
  // GAME FLOW
  // ============================================

  startGame() {
    this.gameState = "playing";
    document.getElementById("startScreen").classList.remove("active");
    document.getElementById("gameScreen").classList.add("active");
    this.renderBoard();
    this.renderGameHeader();
    this.updateEnergyBar();
    this.startTimer();

    // Set Layout Perspective (Mobile Order)
    const mainArea = document.querySelector('.main-game-area');
    if (this.localPlayerColor === 'black') {
      mainArea.classList.add('playing-black');
    } else {
      mainArea.classList.remove('playing-black');
    }

    // Record initial position
  this.recordPosition();

    // Spectator UI adjustments
    if (this.isOnline && this.localPlayerColor === 'spectator') {
      const forfeitBtn = document.getElementById('forfeitBtn');
      const comboBtn = document.getElementById('comboBtn');
      if (forfeitBtn) forfeitBtn.style.display = 'none';
      if (comboBtn) comboBtn.style.display = 'none';
    }
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      // 1. Check for Time Freeze
      const now = Date.now();
      if (this.timeFreeze[this.currentPlayer] > now) {
         // Timer is frozen for current player
         // Optional: Visual indicator could be added here
         return; 
      }

      // 2. Decrement Time
      if (this.currentPlayer === "white") {
        this.whiteTime--;
      } else {
        this.blackTime--;
      }

      // 3. Update UI
      this.updateTimerUI();

      // 4. Check for Timeout
      if (this.whiteTime <= 0 || this.blackTime <= 0) {
        this.endGame(this.whiteTime <= 0 ? "black" : "white");
      }
    }, 1000);
  }

  updateTimerUI() {
    const whiteTimer = document.getElementById("whiteTimer");
    const blackTimer = document.getElementById("blackTimer");
    if (whiteTimer) whiteTimer.textContent = this.formatTime(this.whiteTime);
    if (blackTimer) blackTimer.textContent = this.formatTime(this.blackTime);

    // Update Freeze Visuals
    const now = Date.now();
    const whiteFrozen = this.timeFreeze.white > now;
    const blackFrozen = this.timeFreeze.black > now;
    
    if (whiteTimer) {
        whiteTimer.style.color = whiteFrozen ? "#00d2ff" : "";
        whiteTimer.style.textShadow = whiteFrozen ? "0 0 10px #00d2ff" : "";
    }
    if (blackTimer) {
        blackTimer.style.color = blackFrozen ? "#00d2ff" : "";
        blackTimer.style.textShadow = blackFrozen ? "0 0 10px #00d2ff" : "";
    }
  }

  endGame(winner) {
    this.gameState = "ended";
    clearInterval(this.timerInterval);

    if (this.isOnline && winner === "opponent" && this.localPlayerColor) {
      // Only emit if *I* am the one triggering this (via forfeit button)
      // But endGame is also called locally when checkmated?
      // If checkmated, winner is determined by logic.
      // If forfeit, we pass "opponent".
      this.socket.emit('resign');
    }

    const endScreen = document.getElementById("endScreen");
    const endContent = document.getElementById("endContent");
    if (endScreen) {
      endScreen.classList.add("active");
      document.getElementById("gameScreen").classList.remove("active");

      // Compose end message
      let title = "Game Over";
      let details = "";
      if (winner === "draw") {
        title = "Stalemate — Draw";
        details = "No legal moves available. It's a draw.";
      } else if (winner === "opponent") {
        // If 'opponent' used, winner is the opposite of currentPlayer
        const winColor = this.currentPlayer === "white" ? "black" : "white";
        title = `${this.players[winColor].name} WINS by Forfeit`;
      } else if (winner === "opponent_disconnect") {
        title = "Opponent Disconnected! You Win!";
      } else if (winner === "white" || winner === "black") {
        title = `${this.players[winner].name} WINS!`;
      }

      if (endContent) {
        endContent.innerHTML = `
          <h2>${title}</h2>
          <p>${details}</p>
          <div class="end-stats">
            <div>${this.players.white.name} Moves: ${this.stats.white.moves} | Captures: ${this.stats.white.captures}</div>
            <div>${this.players.black.name} Moves: ${this.stats.black.moves} | Captures: ${this.stats.black.captures}</div>
          </div>
        `;
      }

      // Romantic Easter Egg logic for game end
      const whiteName = this.players.white.name;
      const blackName = this.players.black.name;

      if (winner === "white") {
        if (this.isRomanticName(whiteName)) this.triggerRomanticMessage("win", whiteName);
        if (this.isRomanticName(blackName)) this.triggerRomanticMessage("loss", blackName);
      } else if (winner === "black") {
        if (this.isRomanticName(blackName)) this.triggerRomanticMessage("win", blackName);
        if (this.isRomanticName(whiteName)) this.triggerRomanticMessage("loss", whiteName);
      } else if (winner === "opponent") {
        const loser = this.currentPlayer;
        const actualWinner = loser === "white" ? "black" : "white";
        if (this.isRomanticName(this.players[actualWinner].name)) this.triggerRomanticMessage("win", this.players[actualWinner].name);
        if (this.isRomanticName(this.players[loser].name)) this.triggerRomanticMessage("loss", this.players[loser].name);
      }
    }
  }

  rematch() {
    if (this.isOnline) {
      this.socket.emit('rematch_request');
      const btn = document.getElementById("rematchBtn");
      if (btn) btn.textContent = "Waiting directly...";
      return;
    }

    this.resetGame();
  }

  resetGame() {
    this.board = this.initBoard();
    this.currentPlayer = "white";
    this.selectedSquare = null;
    this.legalMoves = [];
    this.moveHistory = [];
    this.capturedPieces = { white: [], black: [] };
    this.energy = { white: 0, black: 0 };
    this.stats = {
      white: { moves: 0, captures: 0, powersUsed: 0 },
      black: { moves: 0, captures: 0, powersUsed: 0 },
    };
    this.whiteTime = this.timeLimit;
    this.blackTime = this.timeLimit;
    this.gameState = "playing";

    this.hasMoved = {
      white: { king: false, rook_a: false, rook_h: false },
      black: { king: false, rook_a: false, rook_h: false }
    };
    this.activePowers = { white: [], black: [] };
    this.timeFreeze = { white: 0, black: 0 };
    this.doubleMove = { active: false, movesMade: 0 };
    this.queenRushActive = false;
    this.teleportActive = false;
    this.shieldMode = false;

    document.getElementById("endScreen").classList.remove("active");
    document.getElementById("gameScreen").classList.add("active");

    const btn = document.getElementById("rematchBtn");
    if (btn) btn.textContent = "REMATCH";

    this.renderBoard();
    this.renderGameHeader();
    this.updateEnergyBar();
    this.positionHistory.clear();
    this.startGame();
  }

  returnToSetup() {
    this.gameState = "setup";
    document.getElementById("endScreen").classList.remove("active");
    document.getElementById("startScreen").classList.add("active");
  }

  // ============================================
  // CHAT & MESSAGING
  // ============================================

  sendMessage() {
    const input = document.getElementById("chatInput");
    const message = input.value.trim();
    if (!message) return;

    // Emit to socket if online
    if (this.isOnline) {
      this.socket.emit('chat_message', message);
    } else {
      // Local display only if offline
      this.addChatMessage(this.playerName || "Player", message);
    }

    input.value = "";
  }

  addChatMessage(author, message, colorClass = null) {
    const chatBox = document.getElementById("chatBox");
    const messageEl = document.createElement("div");

    // Determine player color class for styling
    let playerClass = "system";
    if (author !== "System") {
      if (colorClass) {
        playerClass = colorClass + "-player";
      } else {
        // Fallback for local messages if color not provided
        playerClass = (this.currentPlayer === "white") ? "white-player" : "black-player";
      }
    }

    messageEl.className = `chat-message ${playerClass}`;
    messageEl.innerHTML = `
    <div class="message-author">${author}</div>
    <div>${message}</div>
  `;
    chatBox.appendChild(messageEl);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  isRomanticName(name) {
    if (!name) return false;
    const targets = ["dina", "dodo", "دينا", "دودو"];
    const lower = name.toLowerCase();
    // STRICT check: check if it contains the target name, IGNORE the crown symbol entirely for logic
    return targets.some(t => lower.includes(t));
  }

  triggerRomanticMessage(category, playerName) {
    if (this.isOnline && this.players[this.localPlayerColor].name !== playerName) {
        return;
    }
    
    // Double check name validity
    if (!this.isRomanticName(playerName)) return;

    const messages = {
      capture: [
        "Your strategic brilliance continues to leave me completely breathless with every move you make.",
        "The way you command the board with such elegance and precision is truly a sight to behold.",
        "Every piece you capture feels like another step towards winning not just the game, but my heart too.",
        "Your intelligence and grace in this match are so captivating that I'm finding it hard to focus on anything else.",
        "There is a certain magic in your gameplay that makes every single moment a purely unforgettable experience."
      ],
      win: [
        "Victory is yours, though I must confess I was lost in your game long before the final move was played.",
        "You are the true master of this board, and seeing you triumph fills me with such immense pride and joy.",
        "Watching you win with such confidence and charm makes me realize how truly extraordinary you are.",
        "Your win today is well-deserved, a perfect reflection of your remarkable talent and spirit.",
        "A game well played by a champion who deserves all the admiration and success in the world."
      ],
      loss: [
        "A single game cannot define you, for your spirit and beauty remain entirely undiminished regardless of the result.",
        "Though the match didn't end in your favor, the grace you showed throughout was truly inspiring.",
        "There is no loss when you play with such heart; you remain the absolute favorite in my eyes, always.",
        "Next time the victory will be yours, and I will be right here by your side, cheering for you with all I have.",
        "You played wonderfully, and I'm still so incredibly proud of the determination and skill you've shown."
      ],
      anytime: [
        "Being here with you, sharing this game, is far more valuable to me than any victory could ever be.",
        "Every second spent in your company feels like a beautiful dream that I never want to wake up from.",
        "You make even the simplest moments feel like a grand romance that I'm so grateful to be a part of.",
        "Chess with you is more than just a game; it's a journey of the heart that I cherish deeply."
      ]
    };

    const categoryMessages = messages[category];
    if (!categoryMessages) return;

    const randomMsg = categoryMessages[Math.floor(Math.random() * categoryMessages.length)];
    // Show as on-screen notification instead of chat
    this.showRomanticNotification(randomMsg);
  }

  showRomanticNotification(text) {
    const el = document.createElement('div');
    el.className = 'romantic-notification';
    el.innerHTML = text;
    
    document.body.appendChild(el);

    // After 8 seconds (longer sentences), start fade out
    setTimeout(() => {
        el.classList.add('hide');
        // Remove from DOM after animation finishes
        setTimeout(() => el.remove(), 1000);
    }, 8000);
  }

  addEmoji(emoji) {
    // Emit to socket if online
    if (this.isOnline) {
      this.socket.emit('emoji', emoji);
    } else {
      // Local display
      this.addChatMessage(this.playerName || "Player", emoji);
    }
  }

  // ============================================
  // POWERS
  // ============================================

  handlePowerClick(item) {
    // 1. Strict Turn/Owner Check
    if (this.isOnline && this.localPlayerColor && this.localPlayerColor !== 'spectator') {
        if (this.currentPlayer !== this.localPlayerColor) {
            this.showNotification("🚫 Not your turn!");
            return; 
        }
    }
    
    // 2. AI Check
    if (this.gameMode === 'ai' && this.currentPlayer === 'black') return;

    const power = item.dataset.power;
    if (this.canActivatePower(this.currentPlayer, power)) {
      // تشغيل الصوت مباشرة
      const powerSound = document.getElementById("powerSound");
      if (powerSound) {
        powerSound.muted = false;
        powerSound.currentTime = 0;
        powerSound.play().catch((e) => { /* ignore */ });
      }

      // Power Messages
      const powerMessages = {
        "queen-rush": `👑 ${this.currentPlayer === "white" ? "White" : "Black"} activated Queen Rush! All pieces move like queens this turn.`,
        "double-turn": `⚡ ${this.currentPlayer === "white" ? "White" : "Black"} activated Double Turn! You get 2 moves.`,
        "teleport": `🌀 ${this.currentPlayer === "white" ? "White" : "Black"} activated Teleport! Select a piece then click anywhere to teleport.`,
        "time-freeze": `❄️ ${this.currentPlayer === "white" ? "White" : "Black"} froze their time! Clock stopped for 3 minutes.`,
      };

      if (powerMessages[power]) {
        this.addChatMessage("System", powerMessages[power]);
      }

      this.activatePower(this.currentPlayer, power);
      item.classList.add("active");
      setTimeout(() => item.classList.remove("active"), 1000);
      this.updateEnergyBar();
    } else {
      // Not enough energy
      const playerName = this.currentPlayer === "white" ? "White" : "Black";
      const cost = this.powersCost[power];
      this.addChatMessage(
        "System",
        `❌ ${playerName} needs ${cost} energy (current: ${this.energy[this.currentPlayer]})`,
      );
    }
  }

  // Power activation logic is handles by high-level methods at the top of the file

  // Combo logic removed.
  activateCombo() {
      // Removed
  }

  // ============================================
  // PAWN PROMOTION
  // ============================================

  promotePawn(piece) {
    if (this.promotionData) {
      const { fromRow, fromCol, row, col } = this.promotionData;
      const color = this.getPieceColor(this.board[row][col]);
      const newPiece =
        color === "white" ? piece.toUpperCase() : piece.toLowerCase();
      this.board[row][col] = newPiece;
      document.getElementById("promotionModal").classList.add("hidden");

      // Emit promotion move to socket if online
      if (this.isOnline) {
        this.socket.emit('move', {
          from: [fromRow, fromCol],
          to: [row, col],
          promotion: piece,
          time: color === 'white' ? this.whiteTime : this.blackTime
        });
      }

      this.promotionData = null;
      if (this.teleportActive) {
        this.teleportActive = false;
        this.selectedSquare = null;
      }

      // After promotion, check for checkmate, stalemate, or repetition
      this.runCheckDetection();

      this.updateMood("white");
      this.updateMood("black");
      this.renderBoard();
      this.updateEnergyBar();

      // Continue with game flow after promotion
      if (!this.doubleMove.active) this.switchPlayer();
      else this.doubleMove.movesMade++;

      if (this.doubleMove.active && this.doubleMove.movesMade >= 2) {
        this.doubleMove.active = false;
        this.doubleMove.movesMade = 0;
        const banner = document.getElementById("activePowerBanner");
        if (banner) banner.style.display = "none";
        this.switchPlayer();
      }
    }
  }


  runCheckDetection() {
    // Check both players for checkmate or stalemate and act accordingly
    if (this.isCheckmate("white")) {
      this.endGame("black");
      return;
    }
    if (this.isCheckmate("black")) {
      this.endGame("white");
      return;
    }
    if (this.isStalemate("white") || this.isStalemate("black")) {
      this.endGame("draw");
      return;
    }
    if (this.checkThreefoldRepetition()) {
      this.endGame("draw");
      return;
    }
  }

  recordPosition() {
    const key = this.getPositionKey();
    this.positionHistory.set(key, (this.positionHistory.get(key) || 0) + 1);
  }

  getPositionKey() {
    // Basic board representation
    let key = this.board.map(row => row.map(cell => cell || '-').join('')).join('|');
    // Turn
    key += `:${this.currentPlayer}`;
    // Castling rights
    key += `:${this.hasMoved.white.king}${this.hasMoved.white.rook_a}${this.hasMoved.white.rook_h}`;
    key += `:${this.hasMoved.black.king}${this.hasMoved.black.rook_a}${this.hasMoved.black.rook_h}`;
    // Power states that affect legality
    key += `:${this.doubleMove.active ? `dm${this.doubleMove.movesMade}` : 'normal'}`;
    // En passant potential (last move double pawn push)
    if (this.lastMove) {
      const [[fR, fC], [tR, tC]] = this.lastMove;
      const piece = this.board[tR][tC];
      if (this.getPieceType(piece) === 'p' && Math.abs(fR - tR) === 2) {
        key += `:ep${tC}`;
      }
    }
    return key;
  }

  checkThreefoldRepetition() {
    const key = this.getPositionKey();
    const count = (this.positionHistory.get(key) || 0) + 1;
    this.positionHistory.set(key, count);

    if (count >= 3) {
      this.addChatMessage("System", "⏳ Draw by Threefold Repetition!");
      return true;
    }
    return false;
  }

  // ============================================
  // TIMER
  // ============================================

  startTimer() {
    this.timerInterval = setInterval(() => {
      const now = Date.now();
      
      if (this.currentPlayer === "white") {
        if (now > this.timeFreeze.white) {
             this.whiteTime--;
        }
        if (this.whiteTime <= 0) {
          this.endGame("black");
        }
      } else {
        if (now > this.timeFreeze.black) {
             this.blackTime--;
        }
        if (this.blackTime <= 0) {
          this.endGame("white");
        }
      }
      this.renderGameHeader();
    }, 1000);
  }

  playSound(type) {
    if (!this.soundEnabled) {
      console.log("Sound is disabled");
      return;
    }
    if (!this.soundEnabled) {
      return;
    }
    const sounds = {
      move: "moveSound",
      capture: "captureSound",
      power: "powerSound",
    };
    const audio = document.getElementById(sounds[type]);
    if (audio) {
      audio.muted = false;
      audio.currentTime = 0;
      audio.play().catch((error) => {
        // fail silently
      });
    }
  }

  /* ============================================ */
  /* ONLINE MULTIPLAYER LOGIC */
  /* ============================================ */

  // ============================================
  // UI HELPERS
  // ============================================

  toggleTheme() {
    const body = document.body;
    if (body.getAttribute("data-theme") === "classic") {
      body.removeAttribute("data-theme");
    } else {
      body.setAttribute("data-theme", "classic");
    }
    this.playSound("move");
  }

  addToHistory(fromRow, fromCol, toRow, toCol, piece) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const pieceSymbols = { p: '', r: 'R', n: 'N', b: 'B', q: 'Q', k: 'K' };

    // Castling Notation
    if (this.getPieceType(piece) === 'k') {
      if (fromCol === 4 && toCol === 6) {
        this.renderHistoryItem("O-O");
        return;
      }
      if (fromCol === 4 && toCol === 2) {
        this.renderHistoryItem("O-O-O");
        return;
      }
    }

    const type = this.getPieceType(piece);
    const p = pieceSymbols[type] || '';
    const notation = `${p}${files[fromCol]}${ranks[fromRow]}-${files[toCol]}${ranks[toRow]}`;

    this.renderHistoryItem(notation);
  }

  renderHistoryItem(text) {
    const log = document.getElementById("moveHistoryLog");
    if (log) {
      const item = document.createElement("div");
      item.textContent = `${this.whiteTime === this.blackTime ? "1." : ""} ${text}`;
      // Improve numbering later
      item.style.padding = "2px 5px";
      item.style.background = "rgba(255,255,255,0.1)";
      item.style.borderRadius = "3px";
      log.appendChild(item);
      log.scrollTop = log.scrollHeight;
    }
  }

  // ============================================
  // AI LOGIC
  // ============================================

  makeAIMove() {
    if (this.gameState !== 'playing' || this.currentPlayer !== 'black') return;

    // Use a short delay for realism, but calculate synchronously (JS is single-threaded anyway)
    setTimeout(() => {
      try {
        const depth = 3; // Lookahead depth
        const bestMove = this.getBestMoveMinimax(depth);

        if (bestMove) {
          this.movePiece(bestMove.from[0], bestMove.from[1], bestMove.to[0], bestMove.to[1]);
          this.switchPlayer();
          this.renderBoard();
          this.runCheckDetection();
        } else {
          // No moves? Checkmate/Stalemate should be handled by game loop.
          console.error("AI returned no moves - potential stalemate or bug.");
        }
      } catch (err) {
        console.error("AI Crash:", err);
        alert("AI Error: " + err.message);
      }
    }, 200);
  }

  // ============================================
  // MINIMAX AI IMPLEMENTATION
  // ============================================

  getBestMoveMinimax(depth) {
    const legalMoves = this.getAllLegalMoves('black');
    if (legalMoves.length === 0) return null;

    let bestMove = null;
    let bestValue = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    // Sort moves to improve Alpha-Beta pruning (Captures first)
    legalMoves.sort((a, b) => this.getMoveValue(b) - this.getMoveValue(a));

    for (const move of legalMoves) {
      // Execute move virtually
      const added = this.virtualMove(move);

      // Recursive Call
      const boardValue = this.minimax(depth - 1, false, alpha, beta);

      // Undo move
      this.undoVirtualMove(move, added);

      if (boardValue > bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestValue);
      if (beta <= alpha) break;
    }

    return bestMove || legalMoves[0];
  }

  minimax(depth, isMaximizing, alpha, beta) {
    if (depth === 0) {
      return this.evaluateBoard();
    }

    const color = isMaximizing ? 'black' : 'white';
    const legalMoves = this.getAllLegalMoves(color);

    if (legalMoves.length === 0) {
      // Terminal node (Checkmate or Stalemate)
      if (this.isInCheck(color)) {
        return isMaximizing ? -10000 : 10000; // Checkmate
      }
      return 0; // Stalemate
    }

    // Sort moves for pruning efficiency
    legalMoves.sort((a, b) => this.getMoveValue(b) - this.getMoveValue(a));

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of legalMoves) {
        const added = this.virtualMove(move);
        const evalScore = this.minimax(depth - 1, false, alpha, beta);
        this.undoVirtualMove(move, added);

        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of legalMoves) {
        const added = this.virtualMove(move);
        const evalScore = this.minimax(depth - 1, true, alpha, beta);
        this.undoVirtualMove(move, added);

        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  // --- Helpers for Minimax ---

  getAllLegalMoves(color) {
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && this.getPieceColor(piece) === color) {
          const moves = this.getLegalMoves(r, c);
          // Optimization: Reuse existing logic but ensure 'from' is attached
          for (const to of moves) {
            allMoves.push({ from: [r, c], to: to });
          }
        }
      }
    }
    return allMoves;
  }

  virtualMove(move) {
    // Perform move on this.board directly but track changes to undo later
    // This is faster than Deep Copying for every node
    const [fromR, fromC] = move.from;
    const [toR, toC] = move.to;

    const movingPiece = this.board[fromR][fromC];
    const targetPiece = this.board[toR][toC];

    // Simplification: We don't handle Castling/EnPassant/Promotion logic fully in Minimax 
    // to keep it fast and simple for this level. 
    // We strictly move pieces physically on the array.

    this.board[toR][toC] = movingPiece;
    this.board[fromR][fromC] = null;

    // Return captured piece to restore later
    return { captured: targetPiece, moved: movingPiece };
  }

  undoVirtualMove(move, info) {
    const [fromR, fromC] = move.from;
    const [toR, toC] = move.to;

    this.board[fromR][fromC] = info.moved;
    this.board[toR][toC] = info.captured;
  }

  getMoveValue(move) {
    // Simple ordering heuristic: Capture = high value
    const [toR, toC] = move.to;
    const target = this.board[toR][toC];
    if (target) {
      // MVP: Capturing Queen > Rook > etc
      const type = this.getPieceType(target);
      if (type === 'q') return 10;
      if (type === 'r') return 5;
      if (type === 'b' || type === 'n') return 3;
      if (type === 'p') return 1;
    }
    return 0;
  }

  evaluateBoard() {
    let totalEvaluation = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        totalEvaluation += this.getPieceValue(this.board[r][c], r, c);
      }
    }
    return totalEvaluation;
  }

  getPieceValue(piece, r, c) {
    if (!piece) return 0;

    const color = this.getPieceColor(piece);
    const type = this.getPieceType(piece);
    const isWhite = color === 'white';

    // Absolute Values
    const values = { p: 10, r: 50, n: 30, b: 30, q: 90, k: 900 };
    let value = values[type] || 0;

    // Position Bonuses (Simplified PST)
    // Flip rows for Black to mirror White's perspective
    const row = isWhite ? r : 7 - r;
    const col = c; // Symmetry doesn't strictly matter for center control, but good to know

    const centerBonus = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [5, 5, 5, 5, 5, 5, 5, 5],
      [1, 1, 2, 3, 3, 2, 1, 1], // Knights/Bishops like center
      [0, 2, 3, 5, 5, 3, 2, 0],
      [0, 2, 3, 5, 5, 3, 2, 0],
      [1, 1, 2, 3, 3, 2, 1, 1],
      [5, 5, 5, 5, 5, 5, 5, 5],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ];

    // Pawn Advancement
    if (type === 'p') {
      // Encourage pushing pawns
      // row 1 (start) -> row 7 (promotion)
      // PST above is generic, let's just add logic:
      const advancement = [0, 0, 1, 2, 4, 6, 10, 0]; // 0-7
      value += advancement[7 - row]; // 7-row because 'row' is normalized 0-7 from white side? 
      // Wait, 'row' calculated above: isWhite ? r : 7-r.
      // If White is at r=6 (start), row=6. Destination r=0 -> row=0.
      // So index should be [row]?
      // White Pawns start at 6, go to 0. 
      // Black Pawns start at 1, go to 7.
      // Let's stick to raw R for simplicity.

      if (isWhite) value += (6 - r) * 2; // Closer to 0 is better
      else value += (r - 1) * 2; // Closer to 7 is better
    }

    // Center Control for Knights/Bishops
    if (type === 'n' || type === 'b') {
      const centerScore = (3.5 - Math.abs(r - 3.5)) + (3.5 - Math.abs(c - 3.5)); // Simple proximity to center
      value += centerScore;
    }

    return isWhite ? -value : value; // Black maximizes (+), White minimizes (-)
  }

  // ============================================
  // UNDO LOGIC
  // ============================================

  undoMove() {
    if (this.isOnline) {
      alert("Undo not available in online ranked matches yet!");
      return;
    }

    if (this.moveHistory.length === 0) return;

    // Simple reload for now as state tracking is complex 
    // (Requires deep copy of board at every move to do properly without replaying)
    // For a "10/10" experience we should implement Replay from Start or State Snapshots.
    // Let's do a basic "Take Back" by checking if we can just reverse the last move?
    // No, because of captures and special moves.

    // Strategy: Re-init board and Replay all moves except last 1 (or 2 if AI)
    const targetHistoryLength = this.gameMode === 'ai' ? this.moveHistory.length - 2 : this.moveHistory.length - 1;

    if (targetHistoryLength < 0) {
      this.resetGame(); // Back to start
      if (this.gameMode === 'ai') {
        // restore logic for AI setup if needed or just let resetGame handle it (but resetGame resets to PvP default?)
        // We need to preserve gameMode.
        this.gameMode = 'ai';
      }
      return;
    }

    // Save current history
    const oldHistory = [...this.moveHistory];

    // Reset
    this.board = this.initBoard();
    this.capturedPieces = { white: [], black: [] };
    this.currentPlayer = 'white';
    this.stats = { white: { moves: 0, captures: 0, powersUsed: 0 }, black: { moves: 0, captures: 0, powersUsed: 0 } };
    this.moveHistory = [];
    this.hasMoved = { white: { king: false, rook_a: false, rook_h: false }, black: { king: false, rook_a: false, rook_h: false } };
    this.positionHistory.clear();

    // Re-record start
    this.recordPosition();

    // Replay
    for (let i = 0; i < targetHistoryLength; i++) {
      const [from, to] = oldHistory[i];
      this.movePiece(from[0], from[1], to[0], to[1], true); // true = isRemote (silent execution/no animation if we supported it)
      // Actually movePiece plays sound etc. We might want to construct a silent version.
      // For now, it will replay fast.
      this.switchPlayer();
      this.recordPosition();
    }

    this.renderBoard();
    this.renderGameHeader();
    this.updateEnergyBar();
  }


  // ============================================
  // PROFILE & LEADERBOARD
  // ============================================

  loadProfile() {
    const savedName = localStorage.getItem('chess_playerName');
    const savedWins = localStorage.getItem('chess_wins') || 0;
    const savedLosses = localStorage.getItem('chess_losses') || 0;

    if (savedName) {
      const nameInput = document.getElementById('playerName');
      if (nameInput) nameInput.value = savedName;
    }

    this.userStats = {
      wins: parseInt(savedWins),
      losses: parseInt(savedLosses)
    };
  }

  saveProfile(name) {
    if (name) localStorage.setItem('chess_playerName', name);
    localStorage.setItem('chess_wins', this.userStats.wins);
    localStorage.setItem('chess_losses', this.userStats.losses);
  }

  updatePersistentStats(result) {
    if (result === 'win') this.userStats.wins++;
    if (result === 'loss') this.userStats.losses++;
    this.saveProfile();
    this.checkAchievements();
  }

  // ============================================
  // ACHIEVEMENTS
  // ============================================

  checkAchievements() {
    const achievements = [
      { id: 'first_win', name: 'First Blood', desc: 'Win your first game', condition: () => this.userStats.wins >= 1 },
      { id: 'five_wins', name: 'Veteran', desc: 'Win 5 games', condition: () => this.userStats.wins >= 5 },
      { id: 'ten_wins', name: 'Master', desc: 'Win 10 games', condition: () => this.userStats.wins >= 10 },
      { id: 'local_legend', name: 'Local Legend', desc: 'Win 20 games', condition: () => this.userStats.wins >= 20 }
    ];

    const unlocked = JSON.parse(localStorage.getItem('chess_achievements') || '[]');
    let newUnlock = false;

    achievements.forEach(ach => {
      if (!unlocked.includes(ach.id) && ach.condition()) {
        unlocked.push(ach.id);
        newUnlock = true;
        this.showNotification(`🏆 Achievement Unlocked: ${ach.name}`);
      }
    });

    if (newUnlock) localStorage.setItem('chess_achievements', JSON.stringify(unlocked));
  }

  showNotification(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.position = 'fixed';
    el.style.top = '20px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = '#f1c40f'; // Gold
    el.style.color = '#000';
    el.style.padding = '10px 20px';
    el.style.borderRadius = '5px';
    el.style.zIndex = '2000';
    el.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    el.style.animation = 'slideDown 0.5s ease-out';

    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 3000);
  }

  loadAchievementsUI() {
    const list = document.getElementById('achievementsList');
    if (!list) return;
    list.innerHTML = '';

    const achievements = [
      { id: 'first_win', name: 'First Blood', desc: 'Win your first game' },
      { id: 'five_wins', name: 'Veteran', desc: 'Win 5 games' },
      { id: 'ten_wins', name: 'Master', desc: 'Win 10 games' },
      { id: 'local_legend', name: 'Local Legend', desc: 'Win 20 games' }
    ];

    const unlocked = JSON.parse(localStorage.getItem('chess_achievements') || '[]');

    achievements.forEach(ach => {
      const isUnlocked = unlocked.includes(ach.id);
      const div = document.createElement('div');
      div.style.padding = '10px';
      div.style.borderBottom = '1px solid #444';
      div.style.opacity = isUnlocked ? '1' : '0.5';
      div.innerHTML = `
            <strong style="color: ${isUnlocked ? '#f1c40f' : '#ccc'}">${ach.name} ${isUnlocked ? '✅' : '🔒'}</strong>
            <div style="font-size: 0.9em; color: #aaa;">${ach.desc}</div>
          `;
      list.appendChild(div);
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  initializeSocketEvents() {
    this.loadProfile();

    // ACHIEVEMENTS UI
    const achBtn = document.getElementById('achievementsBtn');
    const achModal = document.getElementById('achievementsModal');
    const closeAch = document.getElementById('closeAchievementsBtn');

    if (achBtn) {
      achBtn.addEventListener('click', () => {
        this.loadAchievementsUI();
        achModal.style.display = 'block';
      });
    }

    if (closeAch) {
      closeAch.addEventListener('click', () => achModal.style.display = 'none');
    }

    // PROFILE UI
    const profileBtn = document.getElementById('profileBtn');
    const profileModal = document.getElementById('profileModal');
    const closeProfile = document.getElementById('closeProfileBtn');

    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        document.getElementById('profileNameDisplay').textContent = localStorage.getItem('chess_playerName') || "Guest";
        document.getElementById('profileWins').textContent = this.userStats.wins;
        document.getElementById('profileLosses').textContent = this.userStats.losses;
        profileModal.style.display = 'block';
      });
    }

    if (closeProfile) {
      closeProfile.addEventListener('click', () => {
        profileModal.style.display = 'none';
      });
    }

    // LEADERBOARD UI
    const leaderboardBtn = document.getElementById('leaderboardBtn');
    const leaderboardModal = document.getElementById('leaderboardModal');
    const closeLeaderboard = document.getElementById('closeLeaderboardBtn');

    if (leaderboardBtn) {
      leaderboardBtn.addEventListener('click', () => {
        leaderboardModal.style.display = 'block';
        this.socket.emit('request_leaderboard');
      });
    }

    if (closeLeaderboard) {
      closeLeaderboard.addEventListener('click', () => {
        leaderboardModal.style.display = 'none';
      });
    }

    // Room Joining UI
    const joinBtn = document.getElementById('joinBtn');
    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('playerName');
        const roomInput = document.getElementById('roomName');
        const status = document.getElementById('lobbyStatus');

        const name = nameInput.value.trim();
        const room = roomInput.value.trim();

        if (!name || !room) {
          status.textContent = "Please enter both Name and Room ID";
          return;
        }

        status.textContent = "Connecting...";
        this.playerName = name;
        this.saveProfile(name); // Save name
        this.room = room;

        this.socket.emit('join_room', { room, name });
      });
    }

    const matchBtn = document.getElementById('matchmakingBtn');
    if (matchBtn) {
      matchBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('playerName');
        const status = document.getElementById('lobbyStatus');
        const name = nameInput.value.trim();

        if (!name) {
          status.textContent = "Please enter your name first";
          return;
        }

        this.playerName = name;
        status.textContent = "Searching for opponent...";
        this.socket.emit('join_queue', name);
      });
    }

    const aiBtn = document.getElementById('aiBtn');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('playerName');
        this.playerName = nameInput.value.trim() || "Player";

        // Setup Local Game vs AI
        this.isOnline = false;
        this.localPlayerColor = 'white';
        
        const getPremiumName = (name, color) => {
          const lower = (name || "").toLowerCase();
          if (lower.includes("dina") || lower.includes("dodo") || lower.includes("دينا") || lower.includes("دودو")) {
            return name + " ♕";
          }
          return color === 'white' ? name + " ♕" : name + " ♔";
        };

        this.players.white.name = getPremiumName(this.playerName || "Player", 'white');
        this.players.black.name = "AI Bot ♔";

        this.gameState = 'playing';
        this.gameMode = 'ai';

        // Update labels based on the NEW premium design structure
        const whiteLabel = document.getElementById('whiteTimerCard')?.querySelector('.personality');
        const blackLabel = document.getElementById('blackTimerCard')?.querySelector('.personality');

        if (whiteLabel) whiteLabel.textContent = "YOU (" + this.playerName + ")";
        if (blackLabel) blackLabel.textContent = "COMPUTER (AI)";

        // Ensure energy starts at 0 for AI mode
        this.energy = { white: 0, black: 0 };
        this.updateEnergyBar();

        this.startGame();
      });
    }

    const localBtn = document.getElementById('localBtn');
    if (localBtn) {
      localBtn.addEventListener('click', () => {
         const nameInput = document.getElementById('playerName');
         this.playerName = nameInput.value.trim() || "Player 1";

         // Setup Local PvP
         this.isOnline = false;
         this.localPlayerColor = null; // Allow moving both
         this.gameMode = 'pvp';
         
         const getPremiumName = (name, color) => {
           return name + (color === 'white' ? " ♕" : " ♔");
         };

         this.players.white.name = getPremiumName(this.playerName, 'white');
         this.players.black.name = getPremiumName("Player 2", 'black');

         this.gameState = 'playing';
         
         // Labels
         const whiteLabel = document.getElementById('whiteTimerCard')?.querySelector('.personality');
         const blackLabel = document.getElementById('blackTimerCard')?.querySelector('.personality');
         if (whiteLabel) whiteLabel.textContent = "LOCAL PLAYER 1";
         if (blackLabel) blackLabel.textContent = "LOCAL PLAYER 2";

         this.energy = { white: 0, black: 0 };
         this.updateEnergyBar();
         this.startGame();
      });
    }


    this.socket.on('leaderboard_data', (data) => {
      const list = document.getElementById('leaderboardList');
      list.innerHTML = '';

      data.sort((a, b) => b.wins - a.wins);

      data.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `#${index + 1} ${player.name} - Wins: ${player.wins}`;
        li.style.padding = "5px";
        li.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        list.appendChild(li);
      });
    });

    this.socket.on('match_found', ({ room }) => {
      const status = document.getElementById('lobbyStatus');
      if (status) status.textContent = "Match found! Joining...";
      this.room = room;
      this.socket.emit('join_room', { room: this.room, name: this.playerName });
    });

    this.socket.on('player_role', ({ color, name }) => {
      this.localPlayerColor = color;
      const status = document.getElementById('lobbyStatus');
      if (status) status.textContent = `Joined as ${color}. Waiting for opponent...`;
    });

    this.socket.on('spectator_role', ({ room, white, black }) => {
      this.localPlayerColor = 'spectator';
      this.players.white.name = white + " ♕";
      this.players.black.name = black + " ♔";

      // Hide controls specific to players
      document.getElementById('forfeitBtn').style.display = 'none';

      // Initial setup for spectator
      this.startGame();
      this.addChatMessage('System', `You are spectating room: ${room}`);
    });

    this.socket.on('start_game', ({ white, black }) => {
      // Premium Name Mapping
      const getPremiumName = (name, color) => {
        const lower = (name || "").toLowerCase();
        if (lower.includes("dina") || lower.includes("dodo") || lower.includes("دينا") || lower.includes("دودو")) {
          return name + " ♕";
        }
        
        return color === 'white' ? name + " ♕" : name + " ♔";
      };

      this.players.white.name = getPremiumName(white, 'white');
      this.players.black.name = getPremiumName(black, 'black');

      this.opponentName = this.localPlayerColor === 'white' ? black : white;

      // Ensure clean state if this is a rematch
      if (this.moveHistory.length > 0) {
        this.resetGame();
      } else {
        this.startGame();
      }
    });

    this.socket.on('opponent_resigned', () => {
      this.addChatMessage('System', 'Opponent resigned. You win!');
      this.endGame('opponent_disconnect'); // Reusing this for "You Win" generic message or add 'opponent_resign'
    });

    this.socket.on('opponent_move', (moveData) => {
      const { from, to, promotion, time } = moveData;

      // Execute move locally using movePiece to handle Castling, En Passant, Stats, Sound
      const result = this.movePiece(from[0], from[1], to[0], to[1], true);

      // Handle Promotion
      if (result === 'promotion' && promotion) {
        const piece = this.board[to[0]][to[1]]; // The pawn that just moved
        const color = this.getPieceColor(piece);
        const newPiece = color === 'white' ? promotion.toUpperCase() : promotion.toLowerCase();
        this.board[to[0]][to[1]] = newPiece;
      }

      // Update Opponent Timer if provided
      if (time !== undefined) {
        if (this.localPlayerColor === 'white') this.blackTime = time;
        else this.whiteTime = time;
      }

      if (!this.doubleMove.active) {
        this.switchPlayer();
        this.queenRushActive = false;
        this.teleportActive = false;
        const banner = document.getElementById("activePowerBanner");
        if (banner) banner.style.display = "none";
      } else {
        this.doubleMove.movesMade++;
        if (this.doubleMove.movesMade >= 2) {
          this.doubleMove.active = false;
          this.doubleMove.movesMade = 0;
          this.queenRushActive = false;
          this.teleportActive = false;
          const banner = document.getElementById("activePowerBanner");
          if (banner) banner.style.display = "none";
          this.switchPlayer();
        }
      }
      this.renderBoard();
      this.runCheckDetection();
    });


    this.socket.on('opponent_power', (powerData) => {
      const { power, row, col } = powerData;
      // Force activate power
      // For shield, activation logic is distinct (handled by apply_shield), but if passed here:
      if (power !== 'shield') {
          this.activatePower(this.currentPlayer, power, row, col, true);
      }
      this.updateEnergyBar();
    });

    // socket.on('apply_shield', ...) REMOVED

    this.socket.on('chat_message', (data) => {
      this.addChatMessage(data.author, data.text, data.color);
    });

    this.socket.on('emoji', (data) => {
      this.addChatMessage(data.author, data.text, data.color);
    });

    this.socket.on('player_left', (name) => {
      this.addChatMessage('System', `${name} disconnected. You win!`);
      this.endGame('opponent_disconnect');
    });

    this.socket.on('error_message', (msg) => {
      const status = document.getElementById('lobbyStatus');
      if (status) status.textContent = msg;
    });
  }

  // Socket Events
}

const game = new ChessGame();
game.renderBoard();
game.updateEnergyBar();

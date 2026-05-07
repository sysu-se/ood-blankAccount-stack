// src/domain/index.js

// 辅助函数：深度拷贝二维数组
function cloneGrid(grid) {
  return grid.map(row => [...row]);
}

// ==========================================
// 1. Sudoku 实体 (承载盘面与内生规则)
// ==========================================
export function createSudoku(initialGrid, currentGrid = null) {
  const clues = cloneGrid(initialGrid);
  let grid = currentGrid ? cloneGrid(currentGrid) : cloneGrid(initialGrid);

  return {
    getClues() { return cloneGrid(clues); },
    getGrid() { return cloneGrid(grid); },

    // 校验单一移动是否合法（遵守数独同行、同列、同九宫格规则）
    isValidMove(row, col, value) {
      if (row < 0 || row > 8 || col < 0 || col > 8 || value < 1 || value > 9) return false;
      for (let i = 0; i < 9; i++) {
        if (i !== col && grid[row][i] === value) return false;
        if (i !== row && grid[i][col] === value) return false;
      }
      let br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          let rr = br + i, cc = bc + j;
          if ((rr !== row || cc !== col) && grid[rr][cc] === value) return false;
        }
      }
      return true;
    },

    guess({ row, col, value }) {
      if (row < 0 || row > 8 || col < 0 || col > 8 || value < 0 || value > 9) return false;
      if (clues[row][col] !== 0) return false; // 保护初始题面
      if (grid[row][col] === value) return false; // 无实际变更
      grid[row][col] = value;
      return true; // 有效变更
    },

    // 领域校验：返回冲突的坐标数组
    getInvalidCells() {
      const invalid = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          let val = grid[r][c];
          if (val === 0) continue;
          if (!this.isValidMove(r, c, val)) invalid.push(`${c},${r}`);
        }
      }
      return invalid;
    },

    isSolved() {
      if (this.getInvalidCells().length > 0) return false;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) return false;
        }
      }
      return true;
    },

    // HW2: 获取某个格子的所有合法候选数
    getCandidates(row, col) {
      if (grid[row][col] !== 0) return [];
      const candidates = [];
      for (let v = 1; v <= 9; v++) {
        if (this.isValidMove(row, col, v)) candidates.push(v);
      }
      return candidates;
    },

    // HW2: 计算下一步提示（扫描全盘寻找唯一候选数的格子）
    getHint() {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) {
            const cands = this.getCandidates(r, c);
            if (cands.length === 1) {
              return { row: r, col: c, value: cands[0] }; // 找到推定数
            }
          }
        }
      }
      return null; // 无唯一推断，需使用 Explore 模式
    },

    clone() { return createSudoku(clues, grid); },
    toJSON() { return { clues: cloneGrid(clues), grid: cloneGrid(grid) }; },
    toString() { return grid.map(row => row.join(',')).join('|'); }
  };
}

export function createSudokuFromJSON(json) {
  if (!json || !json.clues || !json.grid) throw new Error("Invalid JSON");
  return createSudoku(json.clues, json.grid);
}

// ==========================================
// 2. Game 聚合根 (承载会话、历史记录与探索状态)
// ==========================================
export function createGame({ sudoku, history = [], redoStack = [] }) {
  let currentSudoku = sudoku.clone();
  let _history = history.map(s => s.clone());
  let _redoStack = redoStack.map(s => s.clone());

  // HW2: 探索模式状态控制
  let isExploring = false;
  let exploreSnapshot = null; // 探索起点的局面快照
  let failedPaths = new Set(); // 记忆死胡同指纹

  const canUndo = () => _history.length > 0;
  const canRedo = () => _redoStack.length > 0;

  return {
    getSudoku() {
      // 暴露只读代理，封死越权修改
      return {
        getClues: () => currentSudoku.getClues(),
        getGrid: () => currentSudoku.getGrid(),
        getInvalidCells: () => currentSudoku.getInvalidCells(),
        isSolved: () => currentSudoku.isSolved(),
        getCandidates: (r, c) => currentSudoku.getCandidates(r, c),
        getHint: () => currentSudoku.getHint(),
        toJSON: () => currentSudoku.toJSON(),
        toString: () => currentSudoku.toString()
      };
    },
    
    get isExploring() { return isExploring; },

    guess(move) {
      const nextState = currentSudoku.clone();
      const validMutation = nextState.guess(move);
      
      if (validMutation) {
        // HW2: 探索死路拦截
        if (isExploring && failedPaths.has(nextState.toString())) {
          return "FAILED_PATH_BLOCKED"; // 拒绝走入已知死路
        }

        const snapshot = currentSudoku.clone();
        currentSudoku = nextState;
        
        _history.push(snapshot);
        _redoStack = [];
        return "SUCCESS";
      }
      return "INVALID";
    },

    undo() {
      if (canUndo()) {
        _redoStack.push(currentSudoku.clone());
        currentSudoku = _history.pop();
      }
    },
    redo() {
      if (canRedo()) {
        _history.push(currentSudoku.clone());
        currentSudoku = _redoStack.pop();
      }
    },

    // HW2: 探索流 API
    startExplore() {
      if (!isExploring) {
        isExploring = true;
        exploreSnapshot = currentSudoku.clone(); // 保存分叉点
      }
    },
    commitExplore() {
      if (isExploring) {
        isExploring = false;
        exploreSnapshot = null; // 探索成功，直接合并入主历史
      }
    },
    rollbackExplore() {
      if (isExploring) {
        // 记忆这条死路
        failedPaths.add(currentSudoku.toString()); 
        // 回滚到起点
        currentSudoku = exploreSnapshot.clone();
        isExploring = false;
        exploreSnapshot = null;
      }
    },

    canUndo, canRedo,
    toJSON() {
      return {
        sudoku: currentSudoku.toJSON(),
        history: _history.map(s => s.toJSON()),
        redoStack: _redoStack.map(s => s.toJSON())
      };
    }
  };
}

export function createGameFromJSON(json) {
  return createGame({
    sudoku: createSudokuFromJSON(json.sudoku),
    history: (json.history || []).map(createSudokuFromJSON),
    redoStack: (json.redoStack || []).map(createSudokuFromJSON)
  });
}

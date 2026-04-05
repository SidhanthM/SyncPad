export class Stroke {
  constructor(id, color, size, tool) {
    this.id = id;
    this.color = color;
    this.size = size;
    this.tool = tool;
    this.points = [];
    this.finalized = false;
    this.erased = false;
  }

  addPoint(point) {
    this.points.push(point);
  }

  finalize() {
    this.finalized = true;
  }

  erase() {
    this.erased = true;
  }
}

export class Page {
  constructor(id) {
    this.id = id;
    this.strokes = new Map();
    this.strokeOrder = [];
    this.undoStack = [];
    this.redoStack = [];
  }

  addStroke(stroke) {
    this.strokes.set(stroke.id, stroke);
    this.strokeOrder.push(stroke.id);
    this.undoStack.push({ type: "Add", id: stroke.id });
    this.redoStack = [];
  }

  addStrokePoint(point) {
    const stroke = this.strokes.get(point.strokeId);
    if (stroke) {
      stroke.addPoint(point);
    }
  }

  getVisibleStrokes() {
    return this.strokeOrder
      .map((id) => this.strokes.get(id))
      .filter((s) => !s.erased);
  }

  undo() {
    const action = this.undoStack.pop();
    if (!action) return null;

    if (action.type === "Add") {
      const stroke = this.strokes.get(action.id);
      if (stroke) {
        stroke.erased = true;
        this.redoStack.push(action);
        return { type: "StrokeErase", strokeId: action.id };
      }
    } else if (action.type === "Erase") {
      const stroke = this.strokes.get(action.id);
      if (stroke) {
        stroke.erased = false;
        this.redoStack.push(action);
        return { type: "StrokeUndoErase", strokeId: action.id };
      }
    }
    return null;
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) return null;

    if (action.type === "Add") {
      const stroke = this.strokes.get(action.id);
      if (stroke) {
        stroke.erased = false;
        this.undoStack.push(action);
        return { type: "StrokeAdd", strokeId: action.id };
      }
    } else if (action.type === "Erase") {
      const stroke = this.strokes.get(action.id);
      if (stroke) {
        stroke.erased = true;
        this.undoStack.push(action);
        return { type: "StrokeErase", strokeId: action.id };
      }
    }
    return null;
  }
}

export class Notebook {
  constructor() {
    this.pages = [new Page(0)];
    this.currentPageIndex = 0;
  }

  getCurrentPage() {
    return this.pages[this.currentPageIndex];
  }

  addPage() {
    const newId = this.pages.length;
    this.pages.push(new Page(newId));
    return newId;
  }

  setPage(index) {
    if (index >= 0 && index < this.pages.length) {
      this.currentPageIndex = index;
    }
  }
}

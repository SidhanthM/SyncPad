use crate::protocol::{Message, StrokeBegin, StrokeErase, StrokePoint};
use parking_lot::RwLock;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Stroke {
    pub id: u32,
    pub color: u32,
    pub size: f32,
    pub tool: u8,
    pub points: Vec<StrokePoint>,
    pub finalized: bool,
    pub erased: bool,
}

impl Stroke {
    pub fn new(begin_msg: StrokeBegin) -> Self {
        Stroke {
            id: begin_msg.stroke_id,
            color: begin_msg.color,
            size: begin_msg.size,
            tool: begin_msg.tool,
            points: Vec::new(),
            finalized: false,
            erased: false,
        }
    }

    pub fn add_point(&mut self, point: StrokePoint) {
        self.points.push(point);
    }

    pub fn finalize(&mut self) {
        self.finalized = true;
    }

    pub fn erase(&mut self) {
        self.erased = true;
    }

    pub fn restore(&mut self) {
        self.erased = false;
    }
}

#[derive(Clone)]
pub enum UndoableAction {
    AddStroke(u32, Stroke),   // Stroke ID and its full data
    EraseStroke(u32, Stroke), // Stroke ID and its state before erase
}

#[derive(Clone)]
pub struct Page {
    pub id: u32,
    pub strokes: HashMap<u32, Stroke>,
    pub stroke_order: Vec<u32>, // To maintain drawing order
    pub undo_stack: Vec<UndoableAction>,
    pub redo_stack: Vec<UndoableAction>,
}

impl Page {
    pub fn new(id: u32) -> Self {
        Page {
            id,
            strokes: HashMap::new(),
            stroke_order: Vec::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    pub fn add_stroke(&mut self, stroke: Stroke) {
        let stroke_id = stroke.id;
        self.strokes.insert(stroke_id, stroke.clone());
        self.stroke_order.push(stroke_id);
        self.undo_stack
            .push(UndoableAction::AddStroke(stroke_id, stroke));
        self.redo_stack.clear(); // Clear redo stack on new action
    }

    pub fn add_stroke_point(&mut self, point: StrokePoint) {
        if let Some(stroke) = self.strokes.get_mut(&point.stroke_id) {
            stroke.add_point(point);
        }
    }

    pub fn finalize_stroke(&mut self, stroke_id: u32) {
        if let Some(stroke) = self.strokes.get_mut(&stroke_id) {
            stroke.finalize();
        }
    }

    pub fn erase_stroke(&mut self, stroke_id: u32) {
        if let Some(stroke) = self.strokes.get_mut(&stroke_id) {
            if !stroke.erased {
                let current_stroke_state = stroke.clone();
                stroke.erase();
                self.undo_stack
                    .push(UndoableAction::EraseStroke(stroke_id, current_stroke_state));
                self.redo_stack.clear();
            }
        }
    }

    pub fn undo(&mut self) -> Option<Message> {
        if let Some(action) = self.undo_stack.pop() {
            match action {
                UndoableAction::AddStroke(stroke_id, stroke_data) => {
                    if let Some(_stroke) = self.strokes.remove(&stroke_id) {
                        self.stroke_order.retain(|&id| id != stroke_id);
                        self.redo_stack
                            .push(UndoableAction::AddStroke(stroke_id, stroke_data)); // For redo
                        return Some(Message::StrokeErase(StrokeErase { stroke_id }));
                    }
                }
                UndoableAction::EraseStroke(stroke_id, previous_stroke_state) => {
                    if let Some(stroke) = self.strokes.get_mut(&stroke_id) {
                        stroke.restore();
                        self.redo_stack.push(UndoableAction::EraseStroke(
                            stroke_id,
                            previous_stroke_state.clone(),
                        )); // For redo
                        return Some(Message::StrokeBegin(StrokeBegin {
                            stroke_id,
                            color: previous_stroke_state.color,
                            size: previous_stroke_state.size,
                            tool: previous_stroke_state.tool,
                        }));
                    }
                }
            }
        }
        None
    }

    pub fn redo(&mut self) -> Option<Message> {
        if let Some(action) = self.redo_stack.pop() {
            match action {
                UndoableAction::AddStroke(stroke_id, stroke_data) => {
                    self.strokes.insert(stroke_id, stroke_data.clone());
                    if !self.stroke_order.contains(&stroke_id) {
                        self.stroke_order.push(stroke_id);
                    }
                    self.undo_stack
                        .push(UndoableAction::AddStroke(stroke_id, stroke_data.clone()));
                    return Some(Message::StrokeBegin(StrokeBegin {
                        stroke_id,
                        color: stroke_data.color,
                        size: stroke_data.size,
                        tool: stroke_data.tool,
                    }));
                }
                UndoableAction::EraseStroke(stroke_id, previous_stroke_state) => {
                    if let Some(stroke) = self.strokes.get_mut(&stroke_id) {
                        stroke.erase();
                        self.undo_stack.push(UndoableAction::EraseStroke(
                            stroke_id,
                            previous_stroke_state,
                        ));
                        return Some(Message::StrokeErase(StrokeErase { stroke_id }));
                    }
                }
            }
        }
        None
    }

    pub fn get_visible_strokes(&self) -> Vec<&Stroke> {
        self.stroke_order
            .iter()
            .filter_map(|&id| self.strokes.get(&id))
            .filter(|s| !s.erased)
            .collect()
    }
}

pub struct AppState {
    pub pages: RwLock<HashMap<u32, Page>>,
    pub current_page_index: RwLock<u32>,
    pub next_stroke_id: RwLock<u32>,
}

impl AppState {
    pub fn new() -> Self {
        let mut pages = HashMap::new();
        pages.insert(0, Page::new(0)); // Start with one page
        AppState {
            pages: RwLock::new(pages),
            current_page_index: RwLock::new(0),
            next_stroke_id: RwLock::new(1),
        }
    }

    pub fn get_next_stroke_id(&self) -> u32 {
        let mut next_id = self.next_stroke_id.write();
        let id = *next_id;
        *next_id += 1;
        id
    }

    pub fn get_current_page(&self) -> Page {
        let pages = self.pages.read();
        let current_page_index = *self.current_page_index.read();
        pages.get(&current_page_index).unwrap().clone() // Assuming page always exists
    }

    pub fn add_page(&self) -> u32 {
        let mut pages = self.pages.write();
        let new_page_index = pages.len() as u32;
        pages.insert(new_page_index, Page::new(new_page_index));
        new_page_index
    }

    pub fn set_current_page(&self, page_index: u32) -> bool {
        let pages = self.pages.read();
        if pages.contains_key(&page_index) {
            *self.current_page_index.write() = page_index;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{StrokeBegin, StrokePoint};

    fn create_test_stroke_begin(id: u32) -> StrokeBegin {
        StrokeBegin {
            stroke_id: id,
            color: 0xFF0000FF,
            size: 5.0,
            tool: 0x01,
        }
    }

    fn create_test_stroke_point(id: u32, x: f32, y: f32) -> StrokePoint {
        StrokePoint {
            stroke_id: id,
            x,
            y,
            pressure: 1.0,
            tilt_x: 0.0,
            tilt_y: 0.0,
            timestamp: 0,
        }
    }

    #[test]
    fn test_add_strokes_and_undo_redo() {
        let mut page = Page::new(0);

        // Add 3 strokes
        let s1_begin = create_test_stroke_begin(1);
        let mut s1 = Stroke::new(s1_begin.clone());
        s1.add_point(create_test_stroke_point(1, 10.0, 10.0));
        s1.finalize();
        page.add_stroke(s1);

        let s2_begin = create_test_stroke_begin(2);
        let mut s2 = Stroke::new(s2_begin.clone());
        s2.add_point(create_test_stroke_point(2, 20.0, 20.0));
        s2.finalize();
        page.add_stroke(s2);

        let s3_begin = create_test_stroke_begin(3);
        let mut s3 = Stroke::new(s3_begin.clone());
        s3.add_point(create_test_stroke_point(3, 30.0, 30.0));
        s3.finalize();
        page.add_stroke(s3);

        assert_eq!(page.get_visible_strokes().len(), 3);

        // Undo once -> 2 visible
        let undo_msg = page.undo().unwrap();
        if let Message::StrokeErase(erase_msg) = undo_msg {
            assert_eq!(erase_msg.stroke_id, 3);
        }
        assert_eq!(page.get_visible_strokes().len(), 2);

        // Redo -> 3 visible
        let redo_msg = page.redo().unwrap();
        if let Message::StrokeBegin(begin_msg) = redo_msg {
            assert_eq!(begin_msg.stroke_id, 3);
        }
        assert_eq!(page.get_visible_strokes().len(), 3);
    }

    #[test]
    fn test_erase_stroke_and_undo() {
        let mut page = Page::new(0);

        // Add 3 strokes
        let s1_begin = create_test_stroke_begin(1);
        let mut s1 = Stroke::new(s1_begin.clone());
        s1.add_point(create_test_stroke_point(1, 10.0, 10.0));
        s1.finalize();
        page.add_stroke(s1);

        let s2_begin = create_test_stroke_begin(2);
        let mut s2 = Stroke::new(s2_begin.clone());
        s2.add_point(create_test_stroke_point(2, 20.0, 20.0));
        s2.finalize();
        page.add_stroke(s2);

        let s3_begin = create_test_stroke_begin(3);
        let mut s3 = Stroke::new(s3_begin.clone());
        s3.add_point(create_test_stroke_point(3, 30.0, 30.0));
        s3.finalize();
        page.add_stroke(s3);

        assert_eq!(page.get_visible_strokes().len(), 3);

        // Erase stroke 2
        page.erase_stroke(2);
        assert_eq!(page.get_visible_strokes().len(), 2);
        assert!(page.strokes.get(&2).unwrap().erased);

        // Undo erase -> stroke 2 reappears
        let undo_msg = page.undo().unwrap();
        if let Message::StrokeBegin(begin_msg) = undo_msg {
            assert_eq!(begin_msg.stroke_id, 2);
        }
        assert_eq!(page.get_visible_strokes().len(), 3);
        assert!(!page.strokes.get(&2).unwrap().erased);
    }

    #[test]
    fn test_app_state_next_stroke_id() {
        let app_state = AppState::new();
        assert_eq!(app_state.get_next_stroke_id(), 1);
        assert_eq!(app_state.get_next_stroke_id(), 2);
    }

    #[test]
    fn test_app_state_add_and_set_page() {
        let app_state = AppState::new();
        assert_eq!(*app_state.current_page_index.read(), 0);

        let page_index_1 = app_state.add_page();
        assert_eq!(page_index_1, 1);
        assert_eq!(app_state.pages.read().len(), 2);

        let success = app_state.set_current_page(1);
        assert!(success);
        assert_eq!(*app_state.current_page_index.read(), 1);

        let current_page = app_state.get_current_page();
        assert_eq!(current_page.id, 1);

        let fail = app_state.set_current_page(99);
        assert!(!fail);
    }
}

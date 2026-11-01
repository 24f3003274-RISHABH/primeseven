-- ============================================================================
-- SEED 001: INITIAL 7 SUBJECTS, 3 CATEGORIES & 7 SUBJECT-SERIES PACKAGES
-- Safe & Idempotent: Uses ON CONFLICT DO NOTHING
-- ============================================================================

BEGIN;

-- 1. Seed 3 Test Categories
INSERT INTO categories (id, slug, name, description, default_duration_minutes, display_order)
VALUES
  ('cat-sectional', 'sectional', 'Sectional Tests', 'Focused 30-minute topic and unit mock examinations designed to build speed and conceptual accuracy.', 30, 1),
  ('cat-full-length', 'full_length', 'Full-Length Tests', 'Comprehensive 90-minute CUET PG pattern mock examinations covering the complete subject syllabus.', 90, 2),
  ('cat-pyq', 'pyq', 'Previous Year Question Tests (PYQ)', 'Official CUET PG past examination papers with verified solutions and detailed explanations.', 60, 3)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed 7 Required CUET PG Subjects
INSERT INTO subjects (id, name, slug, paper_code, description, is_active, display_order)
VALUES
  ('subj-pol-sci', 'Political Science', 'political-science', 'HUQP18', 'Complete CUET PG Political Science (HUQP18) preparation covering Western & Indian Political Thought, Comparative Government, International Relations, Public Policy, and Constitutional Governance in India.', TRUE, 1),
  ('subj-phil', 'Philosophy', 'philosophy', 'HUQP16', 'Rigorous CUET PG Philosophy (HUQP16) test series covering Classical Indian Darshanas, Western Metaphysics & Epistemology, Symbolic Logic, Meta-Ethics, Applied Ethics, and Contemporary Continental & Analytic Philosophy.', TRUE, 2),
  ('subj-psych', 'Psychology', 'psychology', 'HUQP20', 'Complete CUET PG Psychology (HUQP20) preparation covering Research Methodology, Statistics, Biopsychology, Cognitive Processes, Personality Theories, Abnormal & Clinical Psychology, and Social Psychology.', TRUE, 3),
  ('subj-hist', 'History', 'history', 'HUQP09', 'Comprehensive CUET PG History (HUQP09) test series spanning Ancient India (Harappan to Post-Gupta), Early Medieval & Delhi Sultanate, Mughal Empire, Modern Colonial & Nationalist History, and World History.', TRUE, 4),
  ('subj-econ', 'Economics', 'economics', 'COQP10', 'Complete CUET PG Economics (COQP10) test series covering Microeconomics, Macroeconomics, Mathematical Methods, Statistical & Econometric Analysis, International Trade, Public Finance, and Indian Economic Development.', TRUE, 5),
  ('subj-geog', 'Geography', 'geography', 'HUQP08', 'Complete CUET PG Geography (HUQP08) test series covering Geomorphology, Climatology, Oceanography, Biogeography, Geographic Thought, Human & Settlement Geography, Regional Planning, GIS/Remote Sensing, and Geography of India.', TRUE, 6),
  ('subj-dis-mgmt', 'Disaster Management', 'disaster-management', 'COQP08', 'Complete CUET PG Disaster Management (COQP08) test series covering Hazard & Vulnerability Assessment, Disaster Risk Reduction (Sendai Framework), NDMA Institutional Framework, GIS Early Warning Systems, and Climate Resilience.', TRUE, 7)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed 7 Subject-Series Packages (Stored strictly in integer paise)
INSERT INTO packages (id, subject_id, package_name, description, price_paise, currency, is_available_for_sale)
VALUES
  ('pkg-political-science', 'subj-pol-sci', 'Political Science — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in Political Science (HUQP18), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 49900, 'INR', TRUE),
  ('pkg-philosophy', 'subj-phil', 'Philosophy — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in Philosophy (HUQP16), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 44900, 'INR', TRUE),
  ('pkg-psychology', 'subj-psych', 'Psychology — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in Psychology (HUQP20), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 54900, 'INR', TRUE),
  ('pkg-history', 'subj-hist', 'History — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in History (HUQP09), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 49900, 'INR', TRUE),
  ('pkg-economics', 'subj-econ', 'Economics — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in Economics (COQP10), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 59900, 'INR', TRUE),
  ('pkg-geography', 'subj-geog', 'Geography — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in Geography (HUQP08), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 49900, 'INR', TRUE),
  ('pkg-disaster-management', 'subj-dis-mgmt', 'Disaster Management — Complete CUET PG Test Series', 'Unlocks all eligible published premium tests in Disaster Management (COQP08), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.', 44900, 'INR', TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;

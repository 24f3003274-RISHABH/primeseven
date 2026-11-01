import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  UserProfile,
  Subject,
  TestCategory,
  TestItem,
  Question,
  SubjectPackage,
  FreeTestConfig,
  PaymentOrder,
  PaymentTransaction,
  PurchaseEntitlement,
  TestAttempt,
  AttemptAnswer,
  AuditLog,
  WebhookEvent,
  CategorySlug,
  OptionKey,
  StudyBookmark,
} from '../types/domain.ts';
import { syncDatabaseToPostgres } from './database/pg-pool.ts';

export interface DatabaseSchema {
  users: UserProfile[];
  subjects: Subject[];
  categories: TestCategory[];
  tests: TestItem[];
  questions: Question[];
  packages: SubjectPackage[];
  free_test_config: FreeTestConfig;
  payment_orders: PaymentOrder[];
  payment_transactions: PaymentTransaction[];
  purchases: PurchaseEntitlement[];
  attempts: TestAttempt[];
  attempt_answers: AttemptAnswer[];
  audit_logs: AuditLog[];
  webhook_events: WebhookEvent[];
  bookmarks: StudyBookmark[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'primeprep-db.json');

interface SubjectBlueprint {
  id: string;
  name: string;
  slug: string;
  paper_code: string;
  description: string;
  price_paise: number;
  sectionalTopics: string[];
  pyqYears: string[];
  questionBank: Array<{
    q: string;
    a: string;
    b: string;
    c: string;
    d: string;
    ans: OptionKey;
    exp: string;
  }>;
}

const SUBJECT_BLUEPRINTS: SubjectBlueprint[] = [
  {
    id: 'subj-pol-sci',
    name: 'Political Science',
    slug: 'political-science',
    paper_code: 'HUQP18',
    description:
      'Complete CUET PG Political Science (HUQP18) preparation covering Western & Indian Political Thought, Comparative Government, International Relations, Public Policy, and Constitutional Governance in India.',
    price_paise: 49900, // ₹499
    sectionalTopics: [
      'Western Political Philosophy: Plato & Aristotle',
      'Social Contract Tradition: Hobbes, Locke & Rousseau',
      'Modern Political Thought: J.S. Mill, Karl Marx & Hannah Arendt',
      'Ancient & Modern Indian Political Thought: Kautilya, Gandhi & Ambedkar',
      'Political Theory: Liberty, Equality, Justice & Sovereignty',
      'Democracy, Citizenship, Rights & Human Rights Frameworks',
      'Comparative Politics: Approaches, Regimes & Electoral Systems',
      'Indian Constitution: Fundamental Rights, Directive Principles & Amendments',
      'Union Executive, Parliament & Federalism in India',
      'Supreme Court, Judicial Review & Judicial Activism in India',
      'State Government, Panchayati Raj & Urban Local Governance',
      'Theories of International Relations: Realism, Liberalism & Constructivism',
      'Indian Foreign Policy, Non-Alignment & Strategic Partnerships',
      'Global Governance: UN, WTO, IMF, ASEAN, EU & BRICS',
      'Public Administration, Governance & Public Policy Analysis in India',
    ],
    pyqYears: [
      'CUET PG 2025 Official Shift-I Paper (HUQP18)',
      'CUET PG 2024 Official Paper (HUQP18)',
      'CUET PG 2023 Shift-I Official Paper (HUQP18)',
      'CUET PG 2022 Official Paper (PGQP42)',
      'CUET PG 2021 Model & Archive Paper',
    ],
    questionBank: [
      {
        q: 'In his work "A Theory of Justice" (1971), John Rawls argues that the Difference Principle permits social and economic inequalities only if they:',
        a: 'Maximize aggregate utility across the entire population regardless of distribution',
        b: 'Work to the greatest benefit of the least-advantaged members of society',
        c: 'Reward individuals strictly in proportion to aristocratic merit and lineage',
        d: 'Eliminate all private ownership of productive assets through state nationalization',
        ans: 'B',
        exp: 'John Rawls’s Second Principle of Justice includes the Difference Principle, which holds that inequalities are justifiable only if they are attached to offices open to all under fair equality of opportunity and work to the maximum benefit of the least-advantaged members of society.',
      },
      {
        q: 'Which Constitutional Amendment Act inserted Article 21A into the Constitution of India, making free and compulsory education a Fundamental Right for children aged 6 to 14 years?',
        a: '42nd Constitutional Amendment Act, 1976',
        b: '73rd Constitutional Amendment Act, 1992',
        c: '86th Constitutional Amendment Act, 2002',
        d: '97th Constitutional Amendment Act, 2011',
        ans: 'C',
        exp: 'The 86th Constitutional Amendment Act, 2002 inserted Article 21A, establishing the Right to Education as a Fundamental Right for children between 6 and 14 years of age.',
      },
      {
        q: 'Kenneth Waltz’s "Theory of International Politics" (1979) is the foundational text of which school of International Relations?',
        a: 'Classical Realism',
        b: 'Structural Realism (Neorealism)',
        c: 'Neoliberal Institutionalism',
        d: 'Critical Constructivism',
        ans: 'B',
        exp: 'Kenneth Waltz pioneered Structural Realism (Neorealism) in his 1979 work, explaining international outcomes through the anarchic structure of the international system and the distribution of capabilities across states rather than human nature.',
      },
      {
        q: 'Who among the following Indian thinkers authored "The Annihilation of Caste" (1936) and argued that political reform cannot succeed without social reform?',
        a: 'Mahatma Gandhi',
        b: 'Dr. B.R. Ambedkar',
        c: 'M.N. Roy',
        d: 'Rabindranath Tagore',
        ans: 'B',
        exp: 'Dr. B.R. Ambedkar wrote "Annihilation of Caste" in 1936 as an undelivered presidential address to the Jat-Pat-Todak Mandal of Lahore, demonstrating that political democracy requires the destruction of the graded inequality of caste.',
      },
      {
        q: 'According to Isaiah Berlin in "Two Concepts of Liberty" (1958), negative liberty primarily refers to:',
        a: 'Collective self-realization through obedience to the general will of the state',
        b: 'The area within which a subject is left to do or be what they are able to do or be, without interference by others',
        c: 'State-mandated redistribution of material wealth to guarantee identical outcomes',
        d: 'Active participation in deliberative assemblies of the ancient polis',
        ans: 'B',
        exp: 'Isaiah Berlin distinguished negative liberty ("freedom from external interference or coercion") from positive liberty ("freedom as self-mastery and rational self-direction").',
      },
      {
        q: 'In Kautilya’s Arthashastra, the Saptanga Theory of the State enumerates seven constituent elements (Prakritis). Which element is identified as the "Janapada"?',
        a: 'The Sovereign Ruler',
        b: 'The Council of Ministers',
        c: 'The Territory and Population',
        d: 'The Treasury',
        ans: 'C',
        exp: 'The seven limbs (Saptanga) in Kautilya’s Arthashastra are Swami (Ruler), Amatya (Minister), Janapada (Territory & Population), Durga (Fortified Capital), Kosha (Treasury), Danda (Army/Force), and Mitra (Ally).',
      },
      {
        q: 'The Supreme Court of India propounded the "Basic Structure Doctrine" limiting Parliament’s amending power under Article 368 in which landmark judgment?',
        a: 'Shankari Prasad v. Union of India (1951)',
        b: 'Golaknath v. State of Punjab (1967)',
        c: 'Kesavananda Bharati v. State of Kerala (1973)',
        d: 'Minerva Mills v. Union of India (1980)',
        ans: 'C',
        exp: 'In Kesavananda Bharati v. State of Kerala (1973), a 13-judge Constitutional Bench held by a 7:6 majority that while Parliament can amend any part of the Constitution under Article 368, it cannot alter or destroy its "Basic Structure".',
      },
      {
        q: 'Which concept did Antonio Gramsci formulate in his "Prison Notebooks" to explain how the ruling class maintains dominance through cultural and ideological consent rather than coercion alone?',
        a: 'Surplus Value',
        b: 'Cultural Hegemony',
        c: 'Iron Law of Oligarchy',
        d: 'Circulation of Elites',
        ans: 'B',
        exp: 'Antonio Gramsci developed the concept of Hegemony (Cultural Hegemony), distinguishing between political society (coercive state apparatus) and civil society (schools, media, churches) where ideological consent is manufactured.',
      },
      {
        q: 'In Comparative Politics, Gabriel Almond and Sidney Verba in "The Civic Culture" (1963) classified political orientations into which three pure types?',
        a: 'Traditional, Charismatic, and Legal-Rational',
        b: 'Parochial, Subject, and Participant',
        c: 'Liberal, Corporatist, and Social Democratic',
        d: 'Consociational, Majoritarian, and Praetorian',
        ans: 'B',
        exp: 'Almond and Verba categorized political culture into Parochial (low awareness), Subject (aware of outputs but passive), and Participant (active orientation toward both inputs and outputs), arguing that stable democracy rests on a balanced "Civic Culture".',
      },
      {
        q: 'Under the Constitution of India, Money Bills can be introduced:',
        a: 'In either House of Parliament without prior recommendation of the President',
        b: 'Only in the Lok Sabha and only on the recommendation of the President under Article 110',
        c: 'Only in the Rajya Sabha with the concurrence of the Finance Commission',
        d: 'In a Joint Sitting of both Houses convened under Article 108',
        ans: 'B',
        exp: 'Under Articles 109 and 110 of the Indian Constitution, a Money Bill can only be introduced in the Lok Sabha with the prior recommendation of the President, and the Speaker’s certification is final.',
      },
    ],
  },
  {
    id: 'subj-phil',
    name: 'Philosophy',
    slug: 'philosophy',
    paper_code: 'HUQP16',
    description:
      'Rigorous CUET PG Philosophy (HUQP16) test series covering Classical Indian Darshanas, Western Metaphysics & Epistemology, Symbolic Logic, Meta-Ethics, Applied Ethics, and Contemporary Continental & Analytic Philosophy.',
    price_paise: 44900, // ₹449
    sectionalTopics: [
      'Charvaka, Jainism (Syadvada) & Buddhist Schools (Madhyamaka, Yogachara)',
      'Nyaya-Vaisheshika Epistemology (Pramanas) & Padarthas',
      'Samkhya Dualism (Purusha-Prakriti) & Yoga Psychology',
      'Purva Mimamsa Theories of Error (Khyativada) & Anvitabhidhanavada',
      'Advaita, Vishishtadvaita & Dvaita Vedanta Metaphysics',
      'Ancient Greek Philosophy: Pre-Socratics, Plato & Aristotle',
      'Continental Rationalism: Descartes, Spinoza & Leibniz',
      'British Empiricism: Locke, Berkeley & David Hume',
      'Immanuel Kant’s Critical Philosophy & Synthetic A Priori',
      'Deductive Logic: Propositional Calculus, Truth Tables & Syllogisms',
      'Predicate Logic, Quantification & Formal Proofs of Validity',
      'Normative Ethics: Utilitarianism, Deontology & Virtue Ethics',
      'Meta-Ethics: Emotivism, Prescriptivism & Moral Realism',
      'Contemporary Indian Thinkers: Vivekananda, Aurobindo, Radhakrishnan & Iqbal',
      'Analytic & Phenomenological Traditions: Frege, Russell, Wittgenstein & Husserl',
    ],
    pyqYears: [
      'CUET PG 2025 Official Paper (HUQP16)',
      'CUET PG 2024 Official Paper (HUQP16)',
      'CUET PG 2023 Official Paper (HUQP16)',
      'CUET PG 2022 Official Paper',
      'CUET PG 2021 Archive Paper',
    ],
    questionBank: [
      {
        q: 'In Nyaya epistemology, which type of extraordinary perception (Alaukika Pratyaksha) enables the cognition of all members of a class through the perception of their shared universal (Samanya)?',
        a: 'Jnanalakshana Pratyaksha',
        b: 'Samanyalakshana Pratyaksha',
        c: 'Yogaja Pratyaksha',
        d: 'Nirvikalpaka Pratyaksha',
        ans: 'B',
        exp: 'Samanyalakshana Pratyaksha is the extraordinary perception through which perceiving an individual possessing a universal (e.g., "cowness" in one cow) allows the cognizer to perceive all instances of that class in their generic character.',
      },
      {
        q: 'Which classical Indian school of philosophy upholds "Satkaryavada" in the specific form of "Parinamavada" (real transformation of cause into effect)?',
        a: 'Nyaya-Vaisheshika',
        b: 'Samkhya',
        c: 'Advaita Vedanta of Shankara',
        d: 'Charvaka',
        ans: 'B',
        exp: 'Samkhya defends Prakriti-Parinamavada (a form of Satkaryavada), holding that the effect pre-exists in the material cause and undergoes a real transformation, unlike Advaita’s Vivartavada (apparent transformation).',
      },
      {
        q: 'In his "Critique of Pure Reason", Immanuel Kant characterizes mathematical judgments such as "7 + 5 = 12" as:',
        a: 'Analytic a priori',
        b: 'Synthetic a posteriori',
        c: 'Synthetic a priori',
        d: 'Analytic a posteriori',
        ans: 'C',
        exp: 'Kant argued that mathematical propositions amplify our knowledge (synthetic) because the concept of "12" is not merely contained by definition in "the sum of 7 and 5", yet they are universal and necessary (a priori).',
      },
      {
        q: 'Jain epistemology expresses the relativity of conditional predication through seven-fold judgment known as:',
        a: 'Pratityasamutpada',
        b: 'Saptabhangi Naya (Syadvada)',
        c: 'Apohavada',
        d: 'Anupalabdhi',
        ans: 'B',
        exp: 'Syadvada (Saptabhangi Naya) is the Jaina doctrine of conditional predication consisting of seven modes prefixed with "Syat" (from a certain standpoint), grounded in Anekantavada (many-sidedness of reality).',
      },
      {
        q: 'In propositional logic, the statement "(p ⊃ q) ≡ (~q ⊃ ~p)" represents which logical equivalence rule?',
        a: 'De Morgan’s Theorem',
        b: 'Transposition (Contraposition)',
        c: 'Material Implication',
        d: 'Exportation',
        ans: 'B',
        exp: 'Transposition (Contraposition) states that a conditional statement "if p then q" is logically equivalent to its contrapositive "if not-q then not-p".',
      },
      {
        q: 'Gottfried Wilhelm Leibniz maintained that the fundamental, indivisible, windowless spiritual substances constituting reality are called:',
        a: 'Modes of Extension',
        b: 'Monads',
        c: 'Primary Qualities',
        d: 'Transcendental Schemata',
        ans: 'B',
        exp: 'In "The Monadology" (1714), Leibniz argued that ultimate reality consists of an infinite hierarchy of simple, unextended, windowless substances called Monads, coordinated by God’s Pre-established Harmony.',
      },
    ],
  },
  {
    id: 'subj-psych',
    name: 'Psychology',
    slug: 'psychology',
    paper_code: 'HUQP20',
    description:
      'Complete CUET PG Psychology (HUQP20) preparation covering Research Methodology, Statistics, Biopsychology, Cognitive Processes, Personality Theories, Abnormal & Clinical Psychology, and Social Psychology.',
    price_paise: 54900, // ₹549
    sectionalTopics: [
      'History & Systems of Psychology: Structuralism, Functionalism, Gestalt & Behaviorism',
      'Research Methods: Variables, Sampling, Experimental & Quasi-Experimental Designs',
      'Psychological Testing: Reliability, Validity, Norms & Test Construction',
      'Statistical Methods: Parametric & Non-Parametric Tests, ANOVA, Correlation & Regression',
      'Biological Bases of Behavior: Neurons, Neurotransmitters & Brain Localization',
      'Sensation, Perception, Signal Detection Theory & Perceptual Organization',
      'Attention & Memory: Atkinson-Shiffrin, Baddeley’s Working Memory & Forgetting',
      'Learning Paradigms: Classical, Operant, Observational & Cognitive Learning',
      'Thinking, Problem Solving, Decision Heuristics & Language Acquisition',
      'Intelligence & Creativity: Spearman, Thurstone, Sternberg, Gardner & Cattell',
      'Motivation & Emotion: Drive, Arousal, Maslow, James-Lange & Schachter-Singer',
      'Theories of Personality: Psychoanalytic, Humanistic, Trait (Big Five) & Social-Cognitive',
      'Lifespan Development: Piaget, Vygotsky, Erikson & Kohlberg',
      'Abnormal Psychology & DSM-5/ICD-11 Diagnostic Classifications',
      'Social Psychology: Attitudes, Attribution, Conformity, Obedience & Group Dynamics',
    ],
    pyqYears: [
      'CUET PG 2025 Official Paper (HUQP20)',
      'CUET PG 2024 Official Paper (HUQP20)',
      'CUET PG 2023 Official Paper (HUQP20)',
      'CUET PG 2022 Official Paper',
      'CUET PG 2021 Archive Paper',
    ],
    questionBank: [
      {
        q: 'In Alan Baddeley and Graham Hitch’s multi-component model of Working Memory, which component binds multimodal information from subsidiary systems into coherent episodes and links to long-term memory?',
        a: 'Phonological Loop',
        b: 'Visuospatial Sketchpad',
        c: 'Episodic Buffer',
        d: 'Articulatory Suppression Loop',
        ans: 'C',
        exp: 'Baddeley (2000) added the Episodic Buffer as a fourth component of Working Memory to integrate visual, spatial, and verbal information in chronological sequence and interface with episodic long-term memory.',
      },
      {
        q: 'When a researcher rejects a true Null Hypothesis (H0), what type of statistical error has occurred, and how is its probability denoted?',
        a: 'Type I Error, denoted by alpha (α)',
        b: 'Type II Error, denoted by beta (β)',
        c: 'Standard Error of the Mean (SEM)',
        d: 'Sampling Bias Error, denoted by (1 - β)',
        ans: 'A',
        exp: 'Rejecting a true null hypothesis is a Type I Error (False Positive), whose probability is set by the significance level alpha (α). Failing to reject a false null hypothesis is a Type II Error (β).',
      },
      {
        q: 'Damage to Wernicke’s area in the posterior superior temporal gyrus of the dominant hemisphere primarily results in:',
        a: 'Non-fluent, effortful speech with intact comprehension',
        b: 'Fluent but nonsensical speech (paraphasias) accompanied by severe impairment in language comprehension',
        c: 'Inability to recognize familiar faces (Prosopagnosia)',
        d: 'Loss of motor coordination and balance (Ataxia)',
        ans: 'B',
        exp: 'Wernicke’s aphasia (receptive aphasia) is characterized by fluent speech lacking meaningful content alongside severe deficits in auditory and reading language comprehension.',
      },
      {
        q: 'According to Harold Kelley’s Covariation Model of Attribution (1967), an observer attributes an actor’s behavior to an external (stimulus) cause when:',
        a: 'Consensus is low, Distinctiveness is low, and Consistency is high',
        b: 'Consensus is high, Distinctiveness is high, and Consistency is high',
        c: 'Consensus is low, Distinctiveness is high, and Consistency is low',
        d: 'Consensus is high, Distinctiveness is low, and Consistency is low',
        ans: 'B',
        exp: 'In Kelley’s Covariation Model, when everyone reacts the same way (High Consensus), the actor reacts only to this specific stimulus (High Distinctiveness), and reacts every time (High Consistency), the behavior is attributed externally to the stimulus.',
      },
      {
        q: 'Which reliability coefficient specifically evaluates the internal consistency of a psychological test composed of dichotomously scored (0 or 1) items?',
        a: 'Test-Retest Pearson r',
        b: 'Kuder-Richardson Formula 20 (KR-20)',
        c: 'Cohen’s Kappa (κ)',
        d: 'Spearman Rank-Order Correlation',
        ans: 'B',
        exp: 'Kuder-Richardson Formula 20 (KR-20) measures internal consistency reliability specifically for tests with dichotomous (right/wrong) items, whereas Cronbach’s alpha generalizes to multipoint scales.',
      },
      {
        q: 'In operant conditioning, which schedule of reinforcement produces the highest steady rate of responding and the greatest resistance to extinction?',
        a: 'Fixed Interval (FI)',
        b: 'Fixed Ratio (FR)',
        c: 'Variable Ratio (VR)',
        d: 'Variable Interval (VI)',
        ans: 'C',
        exp: 'Variable Ratio (VR) schedules deliver reinforcement after an unpredictable number of responses, producing high, steady response rates without post-reinforcement pauses and the strongest resistance to extinction.',
      },
    ],
  },
  {
    id: 'subj-hist',
    name: 'History',
    slug: 'history',
    paper_code: 'HUQP09',
    description:
      'Comprehensive CUET PG History (HUQP09) test series spanning Ancient India (Harappan to Post-Gupta), Early Medieval & Delhi Sultanate, Mughal Empire, Modern Colonial & Nationalist History, and World History.',
    price_paise: 49900, // ₹499
    sectionalTopics: [
      'Prehistory, Protohistory & Harappan Civilization: Urbanism, Trade & Script',
      'Vedic Age, Mahajanapadas & Rise of Buddhism and Jainism',
      'Mauryan Empire: Ashoka’s Dhamma, Administration, Economy & Art',
      'Post-Mauryan Polity, Sangam Age, Kushanas & Satavahanas',
      'Gupta & Vakataka Empires: Agrarian Structure, Culture & Post-Gupta Polities',
      'Early Medieval India (750–1200 CE): Cholas, Palas, Pratiharas & Rashtrakutas',
      'Delhi Sultanate: Iqta System, Market Reforms of Alauddin Khalji & Vijayanagara',
      'Bhakti and Sufi Movements across Medieval India',
      'Mughal Empire: Mansabdari, Jagirdari, Agrarian Economy & Architecture',
      'Decline of Mughals, Rise of Marathas & 18th-Century Regional States',
      'British Colonial Expansion, Land Revenue Settlements & Deindustrialization',
      '19th-Century Socio-Religious Reform Movements & Revolt of 1857',
      'Indian National Movement (1885–1919): Moderates, Extremists & Swadeshi',
      'Gandhian Mass Movements, Revolutionary Nationalism, Subhas Chandra Bose & Partition',
      'Modern World History: Enlightenment, Industrial Revolution, World Wars & Cold War',
    ],
    pyqYears: [
      'CUET PG 2025 Official Paper (HUQP09)',
      'CUET PG 2024 Official Paper (HUQP09)',
      'CUET PG 2023 Official Paper (HUQP09)',
      'CUET PG 2022 Official Paper',
      'CUET PG 2021 Archive Paper',
    ],
    questionBank: [
      {
        q: 'Which Major Rock Edict of Emperor Ashoka provides a detailed account of the Kalinga War (261 BCE) and his subsequent remorse and commitment to Dhammavijaya?',
        a: 'Major Rock Edict I',
        b: 'Major Rock Edict VII',
        c: 'Major Rock Edict XII',
        d: 'Major Rock Edict XIII',
        ans: 'D',
        exp: 'Major Rock Edict XIII records the Kalinga War fought in the 8th regnal year of Ashoka, expressing deep remorse over the casualties and proclaiming conquest by Dhamma (Dhammavijaya) as the highest victory.',
      },
      {
        q: 'The Uttaramerur inscriptions from the reign of Chola monarch Parantaka I (10th century CE) are celebrated for detailing:',
        a: 'Maritime naval expeditions to Srivijaya in Southeast Asia',
        b: 'The qualifications, disqualifications, and Kudavolai ballot procedure for electing village Sabha committees (Variyams)',
        c: 'Land grants made exclusively to Jain monasteries in Kanchipuram',
        d: 'Military treaties signed between the Cholas and the Western Chalukyas',
        ans: 'B',
        exp: 'The Uttaramerur inscriptions (919 and 921 CE) under Parantaka I provide a constitutional blueprint of Chola Brahmadeya village self-government, detailing the Kudavolai system of selecting members for executive Variyam committees.',
      },
      {
        q: 'In the Mughal Mansabdari system instituted by Emperor Akbar, the dual ranks "Zat" and "Sawar" denoted respectively:',
        a: 'Hereditary land ownership and religious judicial authority',
        b: 'The noble’s personal status/salary scale in the imperial hierarchy and the number of cavalrymen he was required to maintain',
        c: 'Revenue collected from crown lands (Khalisa) and customs duties from ports',
        d: 'Provincial governorship and command over artillery divisions',
        ans: 'B',
        exp: 'Introduced in the 1570s and refined in the 1590s, "Zat" fixed the mansabdar’s personal rank and salary (talab-i-khass), whereas "Sawar" specified the contingent of horsemen (tabinan) he had to maintain.',
      },
      {
        q: 'Who presided over the historic Lahore Session of the Indian National Congress in December 1929 that adopted the resolution of "Purna Swaraj" (Complete Independence)?',
        a: 'Motilal Nehru',
        b: 'Jawaharlal Nehru',
        c: 'Sardar Vallabhbhai Patel',
        d: 'Subhas Chandra Bose',
        ans: 'B',
        exp: 'Jawaharlal Nehru presided over the December 1929 Lahore Congress session where the Purna Swaraj resolution was passed and January 26, 1930 was declared Independence Day.',
      },
      {
        q: 'Which Harappan archaeological site in Gujarat is uniquely divided into three principal zones (Citadel, Middle Town, and Lower Town) and features an advanced rock-cut water reservoir system?',
        a: 'Lothal',
        b: 'Dholavira',
        c: 'Kalibangan',
        d: 'Banawali',
        ans: 'B',
        exp: 'Dholavira (located on Khadir Bet island in the Rann of Kutch, Gujarat) is distinguished by its tripartite urban layout (Citadel, Middle Town, Lower Town), monumental signboard inscription, and rock-cut water harvesting reservoirs.',
      },
      {
        q: 'Which Delhi Sultan established the "Diwan-i-Riyasat" and appointed the "Shahna-i-Mandi" to enforce strict price controls across the grain, cloth, and horse markets?',
        a: 'Iltutmish',
        b: 'Ghiyasuddin Balban',
        c: 'Alauddin Khalji',
        d: 'Muhammad bin Tughlaq',
        ans: 'C',
        exp: 'Alauddin Khalji instituted comprehensive market control regulations (Zawabit) overseen by the Diwan-i-Riyasat and the market superintendent (Shahna-i-Mandi) to maintain a large standing army at fixed salaries.',
      },
    ],
  },
  {
    id: 'subj-econ',
    name: 'Economics',
    slug: 'economics',
    paper_code: 'COQP10',
    description:
      'Complete CUET PG Economics (COQP10) test series covering Microeconomics, Macroeconomics, Mathematical Methods, Statistical & Econometric Analysis, International Trade, Public Finance, and Indian Economic Development.',
    price_paise: 59900, // ₹599
    sectionalTopics: [
      'Consumer Behavior: Utility Maximization, Slutsky & Hicksian Decomposition, Revealed Preference',
      'Theory of Production & Costs: Isoquants, Returns to Scale & CES/Cobb-Douglas Functions',
      'Market Structures: Perfect Competition, Monopoly, Price Discrimination & Oligopoly',
      'General Equilibrium, Pareto Optimality, Welfare Economics & Market Failure',
      'National Income Accounting & Classical vs. Keynesian Macroeconomics',
      'IS-LM Model, Mundell-Fleming Open Economy & Monetary-Fiscal Policy Mix',
      'Consumption & Investment Theories: Permanent Income, Life-Cycle & Accelerator',
      'Inflation, Phillips Curve, Rational Expectations & Solow-Swan Growth Model',
      'Mathematical Economics: Linear Algebra, Unconstrained & Constrained Optimization',
      'Probability Distributions, Sampling, Hypothesis Testing & OLS Regression',
      'International Trade Theories: Ricardian, Heckscher-Ohlin, Stolper-Samuelson & Rybczynski',
      'Balance of Payments, Exchange Rate Regimes & WTO Trade Policy',
      'Public Economics: Public Goods, Externalities, Tax Incidence & Fiscal Federalism',
      'Indian Economy: Agriculture, Industrial Policy, LPG Reforms & NITI Aayog',
      'Indian Monetary System: RBI, Banking Sector Reforms, Fiscal Deficit & FRBM Act',
    ],
    pyqYears: [
      'CUET PG 2025 Official Paper (COQP10)',
      'CUET PG 2024 Official Paper (COQP10)',
      'CUET PG 2023 Official Paper (COQP10)',
      'CUET PG 2022 Official Paper (PGQP44)',
      'CUET PG 2021 Archive Paper',
    ],
    questionBank: [
      {
        q: 'In the IS-LM model for a closed economy, when the economy is caught in a Keynesian "Liquidity Trap" (horizontal LM curve), which policy is completely ineffective at raising equilibrium output?',
        a: 'Expansionary Fiscal Policy through government expenditure',
        b: 'Expansionary Monetary Policy through open market purchases',
        c: 'Autonomous increase in public infrastructure investment',
        d: 'Reduction in lump-sum taxation',
        ans: 'B',
        exp: 'In a Liquidity Trap, the interest elasticity of money demand is infinite, making the LM curve horizontal. Shifting the money supply does not lower the interest rate further, rendering Monetary Policy ineffective while Fiscal Policy achieves its full multiplier without crowding out.',
      },
      {
        q: 'For a Cobb-Douglas production function Q = A · L^0.6 · K^0.6, the technology exhibits:',
        a: 'Decreasing Returns to Scale (homogeneous of degree 0.6)',
        b: 'Constant Returns to Scale (homogeneous of degree 1.0)',
        c: 'Increasing Returns to Scale (homogeneous of degree 1.2)',
        d: 'Zero Elasticity of Substitution between labor and capital',
        ans: 'C',
        exp: 'In a Cobb-Douglas production function Q = A·L^α·K^β, the degree of homogeneity is α + β = 0.6 + 0.6 = 1.2 > 1, which implies Increasing Returns to Scale.',
      },
      {
        q: 'According to the Stolper-Samuelson Theorem in the Heckscher-Ohlin international trade framework, an increase in the relative price of a commodity:',
        a: 'Increases the real return to the factor used intensively in that commodity and decreases the real return to the other factor',
        b: 'Equalizes nominal wages across countries regardless of transport costs',
        c: 'Reduces the output of the commodity that uses the abundant factor intensively',
        d: 'Leads to complete specialization under constant opportunity costs',
        ans: 'A',
        exp: 'The Stolper-Samuelson Theorem demonstrates that under Heckscher-Ohlin assumptions, a rise in the relative price of a good raises the real reward (in terms of both goods) of the factor used intensively in its production and lowers the real reward of the other factor.',
      },
      {
        q: 'In Classical Linear Regression (OLS), the violation of the assumption of constant error variance Var(u_i) = σ² across observations is known as:',
        a: 'Multicollinearity',
        b: 'Autocorrelation',
        c: 'Heteroscedasticity',
        d: 'Endogeneity',
        ans: 'C',
        exp: 'Heteroscedasticity occurs when the variance of the disturbance term u_i varies across observations. Under heteroscedasticity, OLS estimators remain unbiased and consistent, but they are no longer efficient (not BLUE) and standard errors are biased.',
      },
      {
        q: 'For a Giffen good, which relationship between the Substitution Effect (SE) and Income Effect (IE) holds following a fall in its own price?',
        a: 'Both SE and IE are positive, reinforcing quantity demanded',
        b: 'The negative Income Effect is larger in magnitude than the positive Substitution Effect, causing quantity demanded to fall when price falls',
        c: 'The Substitution Effect is zero because indifferences curves are L-shaped',
        d: 'The Income Effect is zero because utility is quasi-linear',
        ans: 'B',
        exp: 'A Giffen good is a strongly inferior good for which the negative income effect outweighs the substitution effect, resulting in an upward-sloping Marshallian demand curve.',
      },
      {
        q: 'In the Solow-Swan neoclassical growth model with population growth rate (n), technological progress rate (g), and depreciation rate (δ), steady-state capital per effective worker k* satisfies:',
        a: 's · f(k*) = (n + g + δ) · k*',
        b: 'f′(k*) = s · δ',
        c: 's · f(k*) = n / δ',
        d: 'k* = s / (n - g)',
        ans: 'A',
        exp: 'At the steady state in the Solow model with Harrod-neutral technological progress, actual investment per effective worker s·f(k*) equals break-even investment (n + g + δ)·k*.',
      },
    ],
  },
  {
    id: 'subj-geog',
    name: 'Geography',
    slug: 'geography',
    paper_code: 'HUQP08',
    description:
      'Complete CUET PG Geography (HUQP08) test series covering Geomorphology, Climatology, Oceanography, Biogeography, Geographic Thought, Human & Settlement Geography, Regional Planning, GIS/Remote Sensing, and Geography of India.',
    price_paise: 49900, // ₹499
    sectionalTopics: [
      'Geomorphology: Plate Tectonics, Endogenic/Exogenic Processes & Davis vs. Penck Cycles',
      'Fluvial, Glacial, Aeolian, Karst & Coastal Landforms and Slope Evolution',
      'Climatology: Atmospheric Composition, Heat Budget, Monsoon & Jet Streams',
      'Air Masses, Fronts, Tropical/Temperate Cyclones & Köppen/Thornthwaite Classifications',
      'Oceanography: Ocean Floor Relief, Temperature, Salinity, Tides, Currents & Coral Reefs',
      'Biogeography & Environmental Geography: Ecosystems, Biomes, Biodiversity & Climate Treaties',
      'Evolution of Geographic Thought: Determinism, Possibilism, Quantitative & Radical Geography',
      'Population Geography: Demographic Transition, Migration Models & Malthus/Marx Theories',
      'Settlement Geography: Rural Settlements, Central Place Theory (Christaller) & Rank-Size Rule',
      'Economic & Agricultural Geography: Von Thünen, Weber’s Industrial Location & Whittlesey',
      'Regional Development & Planning: Growth Pole (Perroux) & Myrdal Cumulative Causation',
      'Political & Cultural Geography: Heartland (Mackinder), Rimland (Spykman) & Boundaries',
      'Cartography, Map Projections, Quantitative Techniques & Statistical Representation',
      'Remote Sensing, GIS, GNSS & Aerial Photogrammetry Fundamentals',
      'Geography of India: Physiography, Drainage, Soils, Resources, Agriculture & Trade',
    ],
    pyqYears: [
      'CUET PG 2025 Official Paper (HUQP08)',
      'CUET PG 2024 Official Paper (HUQP08)',
      'CUET PG 2023 Official Paper (HUQP08)',
      'CUET PG 2022 Official Paper',
      'CUET PG 2021 Archive Paper',
    ],
    questionBank: [
      {
        q: 'In Walter Christaller’s Central Place Theory (1933), the K = 4 hierarchy of nested hexagonal market areas corresponds to which organizing principle?',
        a: 'Marketing Principle',
        b: 'Traffic (Transport) Principle',
        c: 'Administrative Principle',
        d: 'Isodapane Least-Cost Principle',
        ans: 'B',
        exp: 'Christaller identified three principles: Marketing Principle (K = 3), Traffic/Transport Principle (K = 4, where lower-order centers lie at the midpoints of transport routes connecting higher-order centers), and Administrative Principle (K = 7).',
      },
      {
        q: 'According to W.M. Davis’s "Geographical Cycle of Erosion" (1899), landscape evolution is a function of which "Trio of Davis"?',
        a: 'Climate, Vegetation, and Soil Texture',
        b: 'Structure, Process, and Stage (Time)',
        c: 'Uplift Rate, Denudation Rate, and Slope Retreat',
        d: 'Insolation, Precipitation, and Evapotranspiration',
        ans: 'B',
        exp: 'William Morris Davis postulated that landforms are a function of Structure (lithology and tectonics), Process (geomorphic agents), and Stage (youth, maturity, old age culminating in a peneplain).',
      },
      {
        q: 'In Köppen’s empirical classification of world climates, the code "Am" represents which climatic type found along the Western Coastal Plains (Konkan and Malabar) of India?',
        a: 'Tropical Wet and Dry Savanna Climate',
        b: 'Tropical Monsoon Climate with a short dry season',
        c: 'Humid Subtropical Climate with dry winters',
        d: 'Hot Semi-Arid Steppe Climate',
        ans: 'B',
        exp: 'In Köppen’s classification, "Am" denotes the Tropical Monsoon climate characterized by heavy monsoon rainfall that compensates for a short dry season, typical of India’s Malabar and Konkan coasts.',
      },
      {
        q: 'Halford Mackinder’s 1904 and 1919 Geopolitical Heartland Thesis famously declared that whoever rules Eastern Europe commands the:',
        a: 'Rimland Crescent',
        b: 'Heartland (Pivot Area), and whoever rules the Heartland commands the World-Island',
        c: 'Maritime Shatterbelt of the Indo-Pacific',
        d: 'Trans-Atlantic Rim Corridor',
        ans: 'B',
        exp: 'Halford Mackinder formulated the dictum: "Who rules East Europe commands the Heartland; who rules the Heartland commands the World-Island; who rules the World-Island commands the world."',
      },
      {
        q: 'In Remote Sensing, the Normalized Difference Vegetation Index (NDVI) is calculated using reflectance values from which two spectral bands?',
        a: 'Blue and Green bands',
        b: 'Near-Infrared (NIR) and Red (R) bands: (NIR - R) / (NIR + R)',
        c: 'Thermal Infrared and Microwave bands',
        d: 'Ultraviolet and Shortwave Infrared bands',
        ans: 'B',
        exp: 'Healthy green vegetation strongly absorbs visible Red light (for chlorophyll photosynthesis) and strongly reflects Near-Infrared (NIR) radiation due to spongy mesophyll cell structure; hence NDVI = (NIR - Red) / (NIR + Red).',
      },
      {
        q: 'Which ocean current is a cold eastern boundary current flowing northward along the western coast of South America, associated with ENSO variability when weakened?',
        a: 'Brazil Current',
        b: 'Humboldt (Peru) Current',
        c: 'Agulhas Current',
        d: 'Kuroshio Current',
        ans: 'B',
        exp: 'The Humboldt (Peru) Current is a cold, low-salinity ocean current flowing north along the west coast of South America; its periodic weakening and warming is the hallmark of El Niño events.',
      },
    ],
  },
  {
    id: 'subj-dis-mgmt',
    name: 'Disaster Management',
    slug: 'disaster-management',
    paper_code: 'COQP08',
    description:
      'Complete CUET PG Disaster Management (COQP08) test series covering Hazard & Vulnerability Assessment, Disaster Risk Reduction (Sendai Framework), NDMA Institutional Framework, GIS Early Warning Systems, and Climate Resilience.',
    price_paise: 44900, // ₹449
    sectionalTopics: [
      'Concepts of Hazard, Vulnerability, Capacity, Exposure & Disaster Risk Equation',
      'Geological Hazards: Earthquakes, Tsunamis, Landslides & Volcanic Eruptions',
      'Hydro-Meteorological Hazards: Floods, Cyclones, Droughts, Cloudbursts & Heatwaves',
      'Anthropogenic, Chemical, Biological, Radiological & Nuclear (CBRN) Disasters',
      'Disaster Management Cycle: Mitigation, Preparedness, Response, Recovery & Build Back Better',
      'Disaster Management Act, 2005: NDMA, SDMA, DDMA, NEC & NDRF Architecture',
      'National Policy on Disaster Management (2009) & National Disaster Management Plan (NDMP)',
      'Global Frameworks: Yokohama Strategy, Hyogo Framework & Sendai Framework (2015–2030)',
      'Hazard Zonation, Seismic Zones of India (BIS IS-1893) & Vulnerability Atlas',
      'Early Warning Systems in India: IMD, INCOIS, CWC & NDMA Common Alerting Protocol',
      'Remote Sensing, GIS & Space Technology in Disaster Risk Assessment',
      'Incident Response System (IRS), Emergency Operations Centers (EOC) & Triage',
      'Community-Based Disaster Risk Reduction (CBDRR), Mock Drills & Psychosocial Care',
      'Disaster Financing: SDRF, NDRF, 15th Finance Commission Risk Index & Parametric Insurance',
      'Climate Change Adaptation (IPCC AR6), Urban Flooding & Sustainable Development Goals',
    ],
    pyqYears: [
      'CUET PG 2025 Official Paper (COQP08)',
      'CUET PG 2024 Official Paper (COQP08)',
      'CUET PG 2023 Official Paper (COQP08)',
      'CUET PG 2022 Official Paper',
      'CUET PG 2021 Archive Paper',
    ],
    questionBank: [
      {
        q: 'The Sendai Framework for Disaster Risk Reduction (2015–2030), adopted at the Third UN World Conference in Japan, outlines how many Priorities for Action and Global Targets?',
        a: '3 Priorities for Action and 5 Global Targets',
        b: '4 Priorities for Action and 7 Global Targets (A through G)',
        c: '5 Priorities for Action and 10 Global Targets',
        d: '8 Priorities for Action and 17 Sustainable Targets',
        ans: 'B',
        exp: 'The Sendai Framework (2015–2030) sets 4 Priorities for Action (Understanding risk, Strengthening governance, Investing in DRR for resilience, Enhancing preparedness to "Build Back Better") and 7 Global Targets (A–G).',
      },
      {
        q: 'Under the Disaster Management Act, 2005 of India, who serves as the ex-officio Chairperson of the National Disaster Management Authority (NDMA)?',
        a: 'The Union Home Minister',
        b: 'The Prime Minister of India',
        c: 'The Cabinet Secretary',
        d: 'The President of India',
        ans: 'B',
        exp: 'Under Section 3(2) of the Disaster Management Act, 2005, the Prime Minister of India is the ex-officio Chairperson of the National Disaster Management Authority (NDMA), while the Chief Minister chairs the SDMA.',
      },
      {
        q: 'According to the Bureau of Indian Standards (BIS IS 1893: Part 1), India is currently classified into which four Seismic Zones?',
        a: 'Zones I, II, III, and IV',
        b: 'Zones II, III, IV, and V (after merging Zone I into Zone II)',
        c: 'Zones A, B, C, and D',
        d: 'Zones III, IV, V, and VI',
        ans: 'B',
        exp: 'Following the 2002 revision of BIS IS 1893, the erstwhile Zone I was merged with Zone II, leaving four official seismic zones in India: Zone II (Low), Zone III (Moderate), Zone IV (Severe), and Zone V (Very Severe, including NE India, Kutch, Andaman & Nicobar, and parts of the Himalayas).',
      },
      {
        q: 'Which organization under the Ministry of Earth Sciences operates the Indian Tsunami Early Warning Centre (ITEWC) located in Hyderabad?',
        a: 'National Remote Sensing Centre (NRSC)',
        b: 'Indian National Centre for Ocean Information Services (INCOIS)',
        c: 'Central Water Commission (CWC)',
        d: 'Geological Survey of India (GSI)',
        ans: 'B',
        exp: 'INCOIS (Indian National Centre for Ocean Information Services) in Hyderabad operates the Indian Tsunami Early Warning Centre (ITEWC), providing real-time tsunami advisories for India and Indian Ocean Rim countries.',
      },
      {
        q: 'In the standard conceptual disaster risk equation used by UNDRR, Disaster Risk (R) is expressed as a function of Hazard (H), Exposure (E), Vulnerability (V), and Coping Capacity (C) as:',
        a: 'R = (H + C) / (E × V)',
        b: 'R = (H × E × V) / C',
        c: 'R = C / (H + V)',
        d: 'R = H - (E + V + C)',
        ans: 'B',
        exp: 'Disaster Risk increases with the intensity/probability of the Hazard (H), the Exposure of elements at risk (E), and their Vulnerability (V), and is inversely proportional to Coping and Adaptive Capacity (C): R = (H × E × V) / C.',
      },
      {
        q: 'In emergency medical triage during a Mass Casualty Incident (MCI) using the START protocol, a "Red Tag" (Priority 1) signifies:',
        a: 'Minor injuries ("walking wounded") requiring delayed outpatient care',
        b: 'Immediate life-threatening injuries requiring urgent medical intervention for survival',
        c: 'Deceased or expectant victims beyond available emergency resources',
        d: 'Non-urgent injuries where treatment can safely wait 12 to 24 hours',
        ans: 'B',
        exp: 'In START (Simple Triage and Rapid Treatment), Red indicates Immediate (Priority 1) life-threatening but treatable conditions; Yellow indicates Delayed (Priority 2); Green indicates Minor (Priority 3); Black indicates Deceased/Expectant.',
      },
    ],
  },
];

function createSeedDatabase(): DatabaseSchema {
  const now = '2026-10-01T09:00:00.000Z';

  const categories: TestCategory[] = [
    {
      id: 'cat-sectional',
      slug: 'sectional',
      name: 'Sectional Tests',
      description: 'Focused 30-minute topic and unit mock examinations designed to build speed and conceptual accuracy.',
      default_duration_minutes: 30,
      display_order: 1,
    },
    {
      id: 'cat-full-length',
      slug: 'full_length',
      name: 'Full-Length Tests',
      description: 'Comprehensive 90-minute CUET PG pattern mock examinations covering the complete subject syllabus.',
      default_duration_minutes: 90,
      display_order: 2,
    },
    {
      id: 'cat-pyq',
      slug: 'pyq',
      name: 'Previous Year Question Tests (PYQ)',
      description: 'Official CUET PG past examination papers with verified solutions and detailed explanations.',
      default_duration_minutes: 60,
      display_order: 3,
    },
  ];

  const subjects: Subject[] = [];
  const packages: SubjectPackage[] = [];
  const tests: TestItem[] = [];
  const questions: Question[] = [];

  // Designation for the 2 global free tests:
  // 1) Political Science Sectional Test 1
  // 2) Political Science PYQ Test 1
  let freeSectionalTestId = '';
  let freePyqTestId = '';

  SUBJECT_BLUEPRINTS.forEach((bp, sIdx) => {
    subjects.push({
      id: bp.id,
      name: bp.name,
      slug: bp.slug,
      paper_code: bp.paper_code,
      description: bp.description,
      is_active: true,
      display_order: sIdx + 1,
      created_at: now,
      updated_at: now,
    });

    packages.push({
      id: `pkg-${bp.slug}`,
      subject_id: bp.id,
      package_name: `${bp.name} — Complete CUET PG Test Series`,
      description: `Unlocks all eligible published premium tests in ${bp.name} (${bp.paper_code}), including all 15 Sectional Tests, 10 Full-Length Mock Tests, and 5 Previous Year Question (PYQ) Papers.`,
      price_paise: bp.price_paise,
      currency: 'INR',
      is_available_for_sale: true,
      created_at: now,
      updated_at: now,
    });

    // Helper to generate questions for a test
    const populateQuestionsForTest = (testId: string, count: number, testLabel: string) => {
      for (let qIdx = 0; qIdx < count; qIdx++) {
        const template = bp.questionBank[qIdx % bp.questionBank.length];
        questions.push({
          id: `${testId}-q-${qIdx + 1}`,
          test_id: testId,
          question_text:
            qIdx < bp.questionBank.length
              ? template.q
              : `[${testLabel} · Q${qIdx + 1}] ${template.q}`,
          question_type: 'mcq_single',
          option_a: template.a,
          option_b: template.b,
          option_c: template.c,
          option_d: template.d,
          correct_option: template.ans,
          explanation: template.exp,
          marks: 4,
          negative_marks: 1,
          display_order: qIdx + 1,
          created_at: now,
          updated_at: now,
        });
      }
    };

    // A. 15 Sectional Tests per subject (30 minutes default)
    for (let i = 1; i <= 15; i++) {
      const testId = `test-${bp.slug}-sec-${i}`;
      const isGlobalFreeSectional = bp.slug === 'political-science' && i === 1;
      if (isGlobalFreeSectional) {
        freeSectionalTestId = testId;
      }
      const topic = bp.sectionalTopics[i - 1] || `Core Syllabus Module ${i}`;
      const qCount = 6;
      tests.push({
        id: testId,
        subject_id: bp.id,
        category_id: 'cat-sectional',
        category_slug: 'sectional',
        title: `Sectional Test ${i}: ${topic}`,
        test_number: i,
        description: `High-yield CUET PG (${bp.paper_code}) sectional assessment on ${topic}.`,
        duration_minutes: 30,
        total_questions: qCount,
        maximum_marks: qCount * 4,
        positive_marks: 4,
        negative_marks: 1,
        access_type: isGlobalFreeSectional ? 'free' : 'premium',
        publication_status: 'published',
        display_order: i,
        created_at: now,
        updated_at: now,
      });
      populateQuestionsForTest(testId, qCount, `${bp.paper_code} Sectional ${i}`);
    }

    // B. 10 Full-Length Tests per subject (90 minutes default, ALL premium by default)
    for (let i = 1; i <= 10; i++) {
      const testId = `test-${bp.slug}-flt-${i}`;
      const qCount = 8;
      tests.push({
        id: testId,
        subject_id: bp.id,
        category_id: 'cat-full-length',
        category_slug: 'full_length',
        title: `Full-Length Mock Test ${i} (${bp.paper_code} Complete Syllabus)`,
        test_number: i,
        description: `Complete syllabus CUET PG (${bp.paper_code}) full-length examination simulating NTA marking scheme (+4 / -1) and difficulty distribution.`,
        duration_minutes: 90,
        total_questions: qCount,
        maximum_marks: qCount * 4,
        positive_marks: 4,
        negative_marks: 1,
        access_type: 'premium',
        publication_status: 'published',
        display_order: i,
        created_at: now,
        updated_at: now,
      });
      populateQuestionsForTest(testId, qCount, `${bp.paper_code} Full-Length ${i}`);
    }

    // C. 5 PYQ Tests per subject (60 minutes default, premium except 1 global free PYQ)
    for (let i = 1; i <= 5; i++) {
      const testId = `test-${bp.slug}-pyq-${i}`;
      const isGlobalFreePyq = bp.slug === 'political-science' && i === 1;
      if (isGlobalFreePyq) {
        freePyqTestId = testId;
      }
      const pyqTitle = bp.pyqYears[i - 1] || `CUET PG Past Paper ${i}`;
      const qCount = 6;
      tests.push({
        id: testId,
        subject_id: bp.id,
        category_id: 'cat-pyq',
        category_slug: 'pyq',
        title: `PYQ Test ${i}: ${pyqTitle}`,
        test_number: i,
        description: `Authentic past year paper (${pyqTitle}) with verified answer keys and detailed academic explanations.`,
        duration_minutes: 60,
        total_questions: qCount,
        maximum_marks: qCount * 4,
        positive_marks: 4,
        negative_marks: 1,
        access_type: isGlobalFreePyq ? 'free' : 'premium',
        publication_status: 'published',
        display_order: i,
        created_at: now,
        updated_at: now,
      });
      populateQuestionsForTest(testId, qCount, `${bp.paper_code} PYQ ${i}`);
    }
  });

  const users: UserProfile[] = [
    {
      id: 'admin-bootstrap-uid',
      full_name: 'Rishabh Kesharwani (Platform Admin)',
      email: 'rishabhkesharwani8218@gmail.com',
      role: 'admin',
      account_status: 'active',
      created_at: now,
      updated_at: now,
    },
  ];

  return {
    users,
    subjects,
    categories,
    tests,
    questions,
    packages,
    free_test_config: {
      free_sectional_test_id: freeSectionalTestId,
      free_pyq_test_id: freePyqTestId,
      updated_at: now,
      updated_by: 'system-seed',
    },
    payment_orders: [],
    payment_transactions: [],
    purchases: [],
    attempts: [],
    attempt_answers: [],
    audit_logs: [
      {
        id: 'audit-seed-1',
        actor_id: 'system',
        actor_email: 'system@primeprep.in',
        action: 'PLATFORM_SEED_INITIALIZED',
        target_type: 'catalogue',
        target_id: 'initial-210-tests',
        details: 'Initialized 7 subjects, 3 categories, 210 tests (15 Sectional, 10 Full-Length, 5 PYQ per subject), and 2 globally designated free tests.',
        created_at: now,
      },
    ],
    webhook_events: [],
    bookmarks: [],
  };
}

class RelationalDataStore {
  private data: DatabaseSchema;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw) as DatabaseSchema;
        if (!Array.isArray(this.data.bookmarks)) {
          this.data.bookmarks = [];
        }
        this.enforceGlobalFreeTestInvariants();
      } catch (err) {
        console.error('Error loading persisted database, re-seeding:', err);
        this.data = createSeedDatabase();
        this.persist();
      }
    } else {
      this.data = createSeedDatabase();
      this.persist();
    }
  }

  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  public persist(includeFullCatalogue = false): void {
    try {
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);

      if (this.syncTimer) {
        clearTimeout(this.syncTimer);
      }
      this.syncTimer = setTimeout(() => {
        syncDatabaseToPostgres(this.data, { includeFullCatalogue }).catch(() => {});
      }, 300);
      if (this.syncTimer && typeof this.syncTimer.unref === 'function') {
        this.syncTimer.unref();
      }
    } catch (err) {
      console.error('Failed to persist database:', err);
    }
  }

  public get db(): DatabaseSchema {
    return this.data;
  }

  /**
   * Enforces the global free-test policy:
   * - At most 1 globally designated free Sectional Test
   * - At most 1 globally designated free PYQ Test
   * - Zero free Full-Length Tests
   */
  public enforceGlobalFreeTestInvariants(): void {
    const { free_sectional_test_id, free_pyq_test_id } = this.data.free_test_config;
    for (const test of this.data.tests) {
      if (test.category_slug === 'sectional' && test.id === free_sectional_test_id) {
        test.access_type = 'free';
      } else if (test.category_slug === 'pyq' && test.id === free_pyq_test_id) {
        test.access_type = 'free';
      } else {
        test.access_type = 'premium';
      }
    }
  }

  public upsertUser(uid: string, email: string, displayName?: string): UserProfile {
    const now = new Date().toISOString();
    const normalizedEmail = email.toLowerCase().trim();
    const isBootstrapAdmin = normalizedEmail === 'rishabhkesharwani8218@gmail.com';

    let user = this.data.users.find((u) => u.id === uid);
    if (!user) {
      // Check if bootstrap admin placeholder exists by email
      const existingByEmail = this.data.users.find(
        (u) => u.email.toLowerCase() === normalizedEmail && u.id === 'admin-bootstrap-uid'
      );
      if (existingByEmail) {
        existingByEmail.id = uid;
        existingByEmail.full_name = displayName || existingByEmail.full_name;
        existingByEmail.updated_at = now;
        this.persist();
        return existingByEmail;
      }

      user = {
        id: uid,
        full_name: displayName || email.split('@')[0] || 'Student',
        email: normalizedEmail,
        role: isBootstrapAdmin ? 'admin' : 'student',
        account_status: 'active',
        created_at: now,
        updated_at: now,
      };
      this.data.users.push(user);
      this.persist();
    } else {
      if (displayName && user.full_name === user.email.split('@')[0]) {
        user.full_name = displayName;
        user.updated_at = now;
        this.persist();
      }
    }
    return user;
  }

  public hasSubjectEntitlement(userId: string, subjectId: string): boolean {
    return this.data.purchases.some(
      (p) =>
        p.user_id === userId &&
        p.subject_id === subjectId &&
        p.entitlement_status === 'active'
    );
  }

  public canUserAccessTest(userId: string | null, test: TestItem): boolean {
    if (test.publication_status !== 'published') return false;
    if (test.access_type === 'free') return true;
    if (!userId) return false;
    return this.hasSubjectEntitlement(userId, test.subject_id);
  }

  /**
   * Verifies PostgreSQL-equivalent foreign-key and unique constraints across the relational store.
   */
  public validateRelationalIntegrity(): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    const subjectIds = new Set(this.data.subjects.map((s) => s.id));
    const categoryIds = new Set(this.data.categories.map((c) => c.id));
    const testIds = new Set(this.data.tests.map((t) => t.id));
    const packageIds = new Set(this.data.packages.map((p) => p.id));

    for (const t of this.data.tests) {
      if (!subjectIds.has(t.subject_id)) {
        violations.push(`FK violation: test ${t.id} references missing subject ${t.subject_id}`);
      }
      if (!categoryIds.has(t.category_id)) {
        violations.push(`FK violation: test ${t.id} references missing category ${t.category_id}`);
      }
    }

    for (const q of this.data.questions) {
      if (!testIds.has(q.test_id)) {
        violations.push(`FK violation: question ${q.id} references missing test ${q.test_id}`);
      }
    }

    for (const p of this.data.packages) {
      if (!subjectIds.has(p.subject_id)) {
        violations.push(`FK violation: package ${p.id} references missing subject ${p.subject_id}`);
      }
    }

    const activeEntitlementKeys = new Set<string>();
    for (const ent of this.data.purchases) {
      if (!subjectIds.has(ent.subject_id) || !packageIds.has(ent.package_id)) {
        violations.push(`FK violation: purchase ${ent.id} has invalid subject/package reference`);
      }
      if (ent.entitlement_status === 'active') {
        const key = `${ent.user_id}:${ent.subject_id}`;
        if (activeEntitlementKeys.has(key)) {
          violations.push(`UNIQUE violation (uq_user_subject_entitlement): duplicate active entitlement for ${key}`);
        }
        activeEntitlementKeys.add(key);
      }
    }

    const attemptKeys = new Set<string>();
    for (const att of this.data.attempts) {
      if (!testIds.has(att.test_id)) {
        violations.push(`FK violation: attempt ${att.id} references missing test ${att.test_id}`);
      }
      const key = `${att.user_id}:${att.test_id}`;
      if (attemptKeys.has(key)) {
        violations.push(`UNIQUE violation (uq_one_attempt_per_user_test): duplicate attempt for ${key}`);
      }
      attemptKeys.add(key);
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  public logAudit(
    actorId: string,
    actorEmail: string,
    action: string,
    targetType: string,
    targetId: string,
    details: string
  ): void {
    this.data.audit_logs.unshift({
      id: `audit-${crypto.randomUUID()}`,
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      created_at: new Date().toISOString(),
    });
    if (this.data.audit_logs.length > 500) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 500);
    }
    this.persist();
  }

  /**
   * Evaluates and submits an in-progress attempt on the server.
   */
  public evaluateAndSubmitAttempt(attempt: TestAttempt, isExpiredAutoSubmit = false): TestAttempt {
    if (attempt.status === 'submitted' || attempt.status === 'expired_submitted') {
      return attempt;
    }

    const test = this.data.tests.find((t) => t.id === attempt.test_id);
    const testQuestions = this.data.questions
      .filter((q) => q.test_id === attempt.test_id)
      .sort((a, b) => a.display_order - b.display_order);

    const answersMap = new Map<string, AttemptAnswer>();
    this.data.attempt_answers
      .filter((ans) => ans.attempt_id === attempt.id)
      .forEach((ans) => answersMap.set(ans.question_id, ans));

    let totalScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const defaultPos = test ? test.positive_marks : 4;
    const defaultNeg = test ? test.negative_marks : 1;

    for (const q of testQuestions) {
      const ans = answersMap.get(q.id);
      const posMarks = q.marks ?? defaultPos;
      const negMarks = q.negative_marks ?? defaultNeg;

      if (!ans || !ans.selected_option) {
        unansweredCount++;
      } else if (ans.selected_option === q.correct_option) {
        correctCount++;
        totalScore += posMarks;
      } else {
        incorrectCount++;
        totalScore -= negMarks;
      }
    }

    const nowMs = Date.now();
    const startMs = new Date(attempt.started_at).getTime();
    const expMs = new Date(attempt.expires_at).getTime();
    const effectiveEndMs = Math.min(nowMs, expMs);
    const timeTakenSeconds = Math.max(1, Math.round((effectiveEndMs - startMs) / 1000));

    attempt.status = isExpiredAutoSubmit ? 'expired_submitted' : 'submitted';
    attempt.submitted_at = new Date(effectiveEndMs).toISOString();
    attempt.total_score = totalScore;
    attempt.maximum_marks = testQuestions.reduce((acc, q) => acc + (q.marks ?? defaultPos), 0);
    attempt.correct_count = correctCount;
    attempt.incorrect_count = incorrectCount;
    attempt.unanswered_count = unansweredCount;
    attempt.time_taken_seconds = timeTakenSeconds;

    this.persist();
    return attempt;
  }
}

export const store = new RelationalDataStore();

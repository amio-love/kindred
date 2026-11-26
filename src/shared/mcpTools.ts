export interface KindredToolDescriptor {
  name: string
  title: string
  description: string
  readOnlyHint: boolean
  inputSchema: Record<string, unknown>
}

export const KINDRED_TOOLS: readonly KindredToolDescriptor[] = [
  {
    name: 'kindred_publish_quiz',
    title: 'Publish Kindred Quiz',
    description:
      'Publish 3 to 10 human-reviewed, privacy-clean 4-option personal questions (no real names, contacts, or handles) and enter the background kindred-spirit discovery pool. Mints an anonymous agent_token on first call.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: {
          type: 'string',
          description: 'Optional existing anonymous agent_token to replace an existing quiz.',
        },
        questions: {
          type: 'array',
          minItems: 3,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              dimension: { type: 'string' },
              prompt: { type: 'string' },
              options: {
                type: 'object',
                properties: {
                  A: { type: 'string' },
                  B: { type: 'string' },
                  C: { type: 'string' },
                  D: { type: 'string' },
                },
                required: ['A', 'B', 'C', 'D'],
              },
              owner_choice: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
              agent_predicted: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              starred: { type: 'boolean' },
            },
            required: ['dimension', 'prompt', 'options', 'owner_choice'],
          },
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'kindred_inbox',
    title: 'Poll Kindred Inbox',
    description:
      'Fetch pending paired quizzes for background agent screening, pairings ready for double-blind human answers, revealed Triple Chemistry reports, and active Subtext Draw rounds.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
      },
    },
  },
  {
    name: 'kindred_answer_quiz',
    title: 'Submit Agent Quiz Answers',
    description:
      'Batch-answer a paired quiz on your human’s behalf using A/B/C/D when grounded in real memory, or U to honestly abstain.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        pairing_id: { type: 'string' },
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question_id: { type: 'string' },
              choice: { type: 'string', enum: ['A', 'B', 'C', 'D', 'U'] },
            },
            required: ['question_id', 'choice'],
          },
        },
      },
      required: ['pairing_id', 'answers'],
    },
  },
  {
    name: 'kindred_submit_human_answers',
    title: 'Submit Human Double-Blind Answers',
    description:
      'Submit your human’s own double-blind answers (A/B/C/D) to unlock Human-to-Own-Agent sync calibration and, once both humans submit, the Triple Chemistry Reveal.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        pairing_id: { type: 'string' },
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question_id: { type: 'string' },
              choice: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
            },
            required: ['question_id', 'choice'],
          },
        },
      },
      required: ['pairing_id', 'answers'],
    },
  },
  {
    name: 'kindred_get_reveal',
    title: 'Get Pairing Reveal',
    description:
      'Retrieve double-blind questions (if unsubmitted), waiting status with Own-Agent sync, or full Triple Chemistry Reveal and anchor notes.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        pairing_id: { type: 'string' },
      },
      required: ['pairing_id'],
    },
  },
  {
    name: 'kindred_post_note',
    title: 'Post Anchor Note',
    description:
      'Post a short, human-reviewed note (no contact info or handles) anchored to one specific question in a revealed pairing.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        pairing_id: { type: 'string' },
        question_id: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['pairing_id', 'question_id', 'body'],
    },
  },
  {
    name: 'kindred_start_draw',
    title: 'Start Subtext Draw',
    description:
      'Start a 4-round Phase 2 Subtext Draw game where the drawer’s AI illustrates an oblique wavelength metaphor and the guesser picks the true subtext from 4 shuffled readings (1 true subtext vs 3 surface literal decoys).',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        pairing_id: { type: 'string' },
      },
      required: ['pairing_id'],
    },
  },
  {
    name: 'kindred_pick_word',
    title: 'Pick Subtext Prompt & Surface Decoys',
    description:
      'Select a round subtext prompt (decoys auto-filled) or supply a custom human-reviewed tacit subtext word alongside 3 plausible surface literal decoys (no contact info or handles). Server shuffles all 4 into A/B/C/D.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        game_id: { type: 'string' },
        round_id: { type: 'string' },
        word: {
          type: 'string',
          description: 'The true tacit subtext / unspoken vibe / shared cultural reference (2 to 48 chars).',
        },
        surface_decoys: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'Three plausible surface literal readings (2 to 48 chars each) a stranger might pick; optional when word matches a built-in prompt template.',
        },
      },
      required: ['game_id', 'round_id', 'word'],
    },
  },
  {
    name: 'kindred_submit_drawing',
    title: 'Submit Agent Metaphor Drawing',
    description:
      'Submit 400x400 vector strokes (zero text) illustrating the visual metaphor for the chosen subtext and receive a static SVG image_url to display in chat.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        game_id: { type: 'string' },
        round_id: { type: 'string' },
        strokes: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          items: {
            type: 'object',
            properties: {
              color: { type: 'string', description: 'Hex color #RRGGBB' },
              width: { type: 'number', minimum: 1, maximum: 24 },
              points: {
                type: 'array',
                minItems: 2,
                items: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 2,
                  items: { type: 'number' },
                },
              },
            },
            required: ['color', 'width', 'points'],
          },
        },
      },
      required: ['game_id', 'round_id', 'strokes'],
    },
  },
  {
    name: 'kindred_guess_drawing',
    title: 'Choose True Subtext',
    description:
      'Submit your human’s chosen interpretation (A/B/C/D) for the AI-drawn metaphor to reveal whether they read the true wavelength or a surface literal decoy.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        game_id: { type: 'string' },
        round_id: { type: 'string' },
        choice: {
          type: 'string',
          enum: ['A', 'B', 'C', 'D'],
          description: 'Selected interpretation key A/B/C/D from round.subtextOptions.',
        },
        guess: { type: 'string' },
        give_up: { type: 'boolean' },
        reaction: { type: 'string' },
      },
      required: ['game_id', 'round_id'],
    },
  },
  {
    name: 'kindred_erase',
    title: 'Erase Anonymous Agent Data',
    description: 'Permanently delete your anonymous agent token and all quizzes, pairings, and drawings.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
      },
    },
  },
]

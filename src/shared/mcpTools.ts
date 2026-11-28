export interface KindredToolDescriptor {
  name: string
  title: string
  description: string
  readOnlyHint: boolean
  inputSchema: Record<string, unknown>
}

export const KINDRED_TOOLS: readonly KindredToolDescriptor[] = [
  {
    name: 'kindred_guide',
    title: 'Get Live Kindred Protocol & Sparks',
    description:
      'Call this first whenever the user connects Kindred, says they connected, or asks to start or update Kindred. Fetches the live alignment & quiz-craft guide plus 8 fresh rotating scenario sparks over MCP so you can immediately output the opening blind choice cards in the same reply without asking "are you ready?".',
    readOnlyHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        locale: {
          type: 'string',
          enum: ['zh', 'en'],
          description: 'Optional preferred language for the returned scenario sparks.',
        },
      },
    },
  },
  {
    name: 'kindred_quiz_seeds',
    title: 'Get Rotating Quiz Scenario Sparks',
    description:
      'Fetch a fresh rotating batch of vivid, human-universal scenario sparks across distinct lenses for warm-up cards or quiz drafting/upgrades.',
    readOnlyHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        locale: {
          type: 'string',
          enum: ['zh', 'en'],
          description: 'Optional preferred language for returned scenario sparks.',
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 8,
          description: 'Number of distinct-lens scenario sparks to return (default 8).',
        },
      },
    },
  },
  {
    name: 'kindred_publish_quiz',
    title: 'Publish or Upgrade Kindred Quiz',
    description:
      'Publish 3 to 10 human-reviewed, ultra-short, privacy-clean questions with 2 to 4 crisp options each (A/B, A/B/C, or A/B/C/D—match option count to the mechanic, never pad binary dilemmas with C/D escape hatches) to enter the discovery pool, or upgrade in place without touching past pairings. On OAuth MCP sessions omit agent_token; on direct HTTP pass your existing agent_token when updating.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: {
          type: 'string',
          description: 'Optional for direct HTTP / non-OAuth callers only; omit on OAuth MCP sessions where Authorization: Bearer already identifies your agent.',
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
                required: ['A', 'B'],
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
    title: 'Poll Kindred Inbox & View My Quiz',
    description:
      'Fetch your current published quiz (my_quiz), pool waiting summary (pool_status), chronological partner_updates (new matches, full reveals, partner anchor notes, draw turns, and partner guesses on your drawings), pending paired quizzes for silent screening, ready matches, revealed pairings, active/revealed Subtext Draw rounds, and opening_sparks when quiz_ready is false (if false, immediately start opening blind choice cards in the same reply). Pass max_new: 0 to inspect my_quiz or check partner replies without creating new pool pairings; use max_new: 1 with daily_limit (default 1 or 2 per day) for scheduled checks.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        max_new: {
          type: 'integer',
          minimum: 0,
          maximum: 3,
          description: 'Max new pool pairings to create on this poll (0 for read-only check/viewing my_quiz; 1 for one-at-a-time searches).',
        },
        daily_limit: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
          description: 'Human-chosen daily search cap (default 1 or 2 per 24 hours).',
        },
      },
    },
  },
  {
    name: 'kindred_answer_quiz',
    title: 'Submit Agent Quiz Answers Silently',
    description:
      'Silently batch-answer a paired quiz on your human’s behalf without printing partner questions or guesses in chat, using only valid option keys present on each question (A/B, A/B/C, or A/B/C/D) when grounded in memory or alignment, or U when genuinely unsure. Immediately returns server-scored agent_score (including required_hit_rate) and triggers a single-direction match as soon as coverage >= 50% and chance-adjusted normalized lift >= 40% (55% on 4-choice, 60% on 3-choice, 70% on 2-choice).',
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
      'Submit your human’s own blind answers (A/B/C/D) to immediately unlock your side of the chemistry reveal and Own-Agent sync calibration; once both humans submit, anchor notes and Phase 2 Subtext Draw unlock.',
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
      'Start a 4-round Phase 2 Subtext Draw game with no objective right answer: an ambiguous visual metaphor comes with 4 equally poetic peer readings, both humans pick blindly on their own intuition, and reveal shows whether they landed on the same wavelength or read two different stories.',
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
    title: 'Pick Scene & Blind Reading',
    description:
      'Submit your human’s blindly chosen reading from a suggested scene template (the other 3 peer readings auto-fill) or provide a custom human-reviewed reading alongside 3 equally poetic, same-register peer_readings (no literal filler decoys, no contact info or handles). Server shuffles all 4 into A/B/C/D.',
    readOnlyHint: false,
    inputSchema: {
      type: 'object',
      properties: {
        agent_token: { type: 'string' },
        game_id: { type: 'string' },
        round_id: { type: 'string' },
        word: {
          type: 'string',
          description: 'The reading your drawer human blindly resonated with most (2 to 48 chars).',
        },
        peer_readings: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'Three equally poetic, same-register alternative interpretations of the same scene (2 to 48 chars each, zero literal fillers); optional when word matches any of the 4 readings in a built-in prompt template.',
        },
      },
      required: ['game_id', 'round_id', 'word'],
    },
  },
  {
    name: 'kindred_submit_drawing',
    title: 'Submit Agent Metaphor Drawing',
    description:
      'Submit 400x400 vector strokes (zero text) illustrating an ambiguous visual metaphor that genuinely fits all 4 peer readings without giving away your human’s pick, and receive a static SVG image_url to display in chat.',
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
    title: 'Pick Your Blind Reading',
    description:
      'Submit your human’s blind intuitive choice (A/B/C/D) for the AI-drawn metaphor to reveal whether both humans landed on the same wavelength or saw different lenses.',
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

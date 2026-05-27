import type {
  UserProfile,
  SimilarCase,
  SubredditRule,
} from '../../shared/types';

export const DEFAULT_RULES: SubredditRule[] = [
  {
    id: 'rule-1',
    index: 1,
    title: 'No harassment or hate speech',
    description:
      'Content that targets individuals or groups with harassment, threats, or hate speech is prohibited.',
    category: 'behavior',
  },
  {
    id: 'rule-2',
    index: 2,
    title: 'No low-quality or low-effort content',
    description:
      'Posts and comments must contribute meaningfully. One-word responses, meme-only posts, and content lacking context will be removed.',
    category: 'content',
  },
  {
    id: 'rule-3',
    index: 3,
    title: 'Stay on topic',
    description:
      'Content must be relevant to the subreddit topic. Off-topic posts and derailing comments will be removed.',
    category: 'content',
  },
  {
    id: 'rule-4',
    index: 4,
    title: 'No personal information / doxxing',
    description:
      'Sharing personal information about others without consent is strictly prohibited.',
    category: 'security',
  },
  {
    id: 'rule-5',
    index: 5,
    title: 'No spam or self-promotion',
    description:
      'Excessive self-promotion, repetitive posts, and commercial spam are not allowed.',
    category: 'content',
  },
  {
    id: 'rule-6',
    index: 6,
    title: 'Use clear, descriptive titles',
    description:
      'Post titles must clearly describe the content. Vague or clickbait titles will be removed.',
    category: 'format',
  },
  {
    id: 'rule-7',
    index: 7,
    title: 'Be civil in discussions',
    description:
      'Personal attacks, insults, and aggressive behavior towards other users are not tolerated.',
    category: 'behavior',
  },
];

const MOCK_USERS: Record<string, UserProfile> = {
  trouble_maker_99: {
    username: 'trouble_maker_99',
    accountCreated: '2026-05-20T00:00:00Z',
    accountAgeDays: 7,
    karma: 12,
    commentKarma: -45,
    isNewAccount: true,
    previousViolations: 3,
    recentPosts: [
      {
        id: 'tm-post-1',
        type: 'comment',
        title: '',
        body: 'This is trash lol delete this garbage',
        subreddit: 'testsub',
        createdAt: '2026-05-26T10:00:00Z',
        score: -8,
        removed: true,
      },
      {
        id: 'tm-post-2',
        type: 'comment',
        title: '',
        body: 'youre all idiots if you believe this',
        subreddit: 'testsub',
        createdAt: '2026-05-26T09:00:00Z',
        score: -12,
        removed: true,
      },
      {
        id: 'tm-post-3',
        type: 'post',
        title: 'why does this sub even exist',
        body: 'total waste of time',
        subreddit: 'testsub',
        createdAt: '2026-05-25T14:00:00Z',
        score: 0,
        removed: true,
      },
    ],
  },
  casual_user_42: {
    username: 'casual_user_42',
    accountCreated: '2024-03-15T00:00:00Z',
    accountAgeDays: 804,
    karma: 3420,
    commentKarma: 2150,
    isNewAccount: false,
    previousViolations: 0,
    recentPosts: [
      {
        id: 'cu-post-1',
        type: 'comment',
        title: '',
        body: 'Thanks for sharing this! Really helpful perspective on the topic.',
        subreddit: 'testsub',
        createdAt: '2026-05-26T08:00:00Z',
        score: 15,
        removed: false,
      },
      {
        id: 'cu-post-2',
        type: 'post',
        title: 'Question about best practices for mod tools',
        body: 'Ive been researching different approaches to moderation and wanted to get community input on what tools work best for larger subreddits.',
        subreddit: 'testsub',
        createdAt: '2026-05-24T12:00:00Z',
        score: 42,
        removed: false,
      },
      {
        id: 'cu-post-3',
        type: 'comment',
        title: '',
        body: 'Agreed. I think the key is finding balance between automation and human judgment.',
        subreddit: 'testsub',
        createdAt: '2026-05-23T16:00:00Z',
        score: 8,
        removed: false,
      },
      {
        id: 'cu-post-4',
        type: 'comment',
        title: '',
        body: 'Great point about transparency in moderation decisions.',
        subreddit: 'testsub',
        createdAt: '2026-05-22T20:00:00Z',
        score: 23,
        removed: false,
      },
      {
        id: 'cu-post-5',
        type: 'post',
        title: 'My experience with community building',
        body: 'After moderating for 2 years, here are some lessons learned about building healthy online communities.',
        subreddit: 'testsub',
        createdAt: '2026-05-20T09:00:00Z',
        score: 156,
        removed: false,
      },
    ],
  },
  spam_bot_2026: {
    username: 'spam_bot_2026',
    accountCreated: '2026-05-26T00:00:00Z',
    accountAgeDays: 1,
    karma: 1,
    commentKarma: 0,
    isNewAccount: true,
    previousViolations: 1,
    recentPosts: [
      {
        id: 'sb-post-1',
        type: 'post',
        title: 'BUY MY PRODUCT NOW CLICK HERE!!!!',
        body: 'Best product ever! Visit my site at example.com! Limited time offer!!!',
        subreddit: 'testsub',
        createdAt: '2026-05-26T14:00:00Z',
        score: 0,
        removed: true,
      },
      {
        id: 'sb-post-2',
        type: 'post',
        title: 'FREE MONEY CLICK HERE',
        body: 'Earn $5000 per day working from home!!! Click my profile for details!!!',
        subreddit: 'testsub',
        createdAt: '2026-05-26T13:00:00Z',
        score: -3,
        removed: true,
      },
    ],
  },
  heated_debater: {
    username: 'heated_debater',
    accountCreated: '2023-08-10T00:00:00Z',
    accountAgeDays: 1021,
    karma: 8900,
    commentKarma: 7200,
    isNewAccount: false,
    previousViolations: 2,
    recentPosts: [
      {
        id: 'hd-post-1',
        type: 'comment',
        title: '',
        body: 'Are you seriously defending this position? Its objectively wrong and anyone with half a brain can see that.',
        subreddit: 'testsub',
        createdAt: '2026-05-26T11:00:00Z',
        score: -5,
        removed: false,
      },
      {
        id: 'hd-post-2',
        type: 'comment',
        title: '',
        body: 'I see your point but I respectfully disagree. The data shows a different picture.',
        subreddit: 'testsub',
        createdAt: '2026-05-25T10:00:00Z',
        score: 30,
        removed: false,
      },
      {
        id: 'hd-post-3',
        type: 'comment',
        title: '',
        body: 'This is the worst take Ive ever seen on this sub. Do you even read the sources you cite?',
        subreddit: 'testsub',
        createdAt: '2026-05-24T15:00:00Z',
        score: -15,
        removed: true,
      },
      {
        id: 'hd-post-4',
        type: 'post',
        title: 'Unpopular opinion: the current moderation approach is failing',
        body: 'I think we need to have an honest discussion about whether current policies are actually working.',
        subreddit: 'testsub',
        createdAt: '2026-05-23T09:00:00Z',
        score: 67,
        removed: false,
      },
    ],
  },
  low_effort_pepe: {
    username: 'low_effort_pepe',
    accountCreated: '2025-11-01T00:00:00Z',
    accountAgeDays: 207,
    karma: 450,
    commentKarma: 200,
    isNewAccount: false,
    previousViolations: 1,
    recentPosts: [
      {
        id: 'le-post-1',
        type: 'comment',
        title: '',
        body: 'lol',
        subreddit: 'testsub',
        createdAt: '2026-05-26T15:00:00Z',
        score: 2,
        removed: false,
      },
      {
        id: 'le-post-2',
        type: 'comment',
        title: '',
        body: 'this',
        subreddit: 'testsub',
        createdAt: '2026-05-26T12:00:00Z',
        score: 1,
        removed: false,
      },
      {
        id: 'le-post-3',
        type: 'comment',
        title: '',
        body: 'ok',
        subreddit: 'testsub',
        createdAt: '2026-05-25T18:00:00Z',
        score: -1,
        removed: false,
      },
      {
        id: 'le-post-4',
        type: 'post',
        title: 'thoughts?',
        body: 'what do you guys think',
        subreddit: 'testsub',
        createdAt: '2026-05-25T10:00:00Z',
        score: 0,
        removed: true,
      },
    ],
  },
  doxxer_account: {
    username: 'doxxer_account',
    accountCreated: '2026-05-25T00:00:00Z',
    accountAgeDays: 2,
    karma: 5,
    commentKarma: -20,
    isNewAccount: true,
    previousViolations: 1,
    recentPosts: [
      {
        id: 'da-post-1',
        type: 'comment',
        title: '',
        body: 'John Smith from 123 Main St Austin TX - his phone is (512) 555-0198. Everyone should know who this guy really is.',
        subreddit: 'testsub',
        createdAt: '2026-05-26T16:00:00Z',
        score: -25,
        removed: true,
      },
    ],
  },
};

const MOCK_SIMILAR_CASES: Record<string, SimilarCase[]> = {
  harassment: [
    {
      id: 'case-h-1',
      title: 'User called another member "brainless" in debate thread',
      summary:
        'User engaged in name-calling during a heated discussion. Content escalated from disagreement to personal attacks.',
      outcome: 'removed',
      outcomeReason:
        'Violated Rule 1 (harassment) and Rule 7 (civility). User received temporary ban.',
      similarityScore: 0.89,
      resolvedAt: '2026-05-20T14:00:00Z',
    },
    {
      id: 'case-h-2',
      title: 'Multiple insults directed at OP in question thread',
      summary:
        'User posted series of insulting comments targeting the original poster.',
      outcome: 'removed',
      outcomeReason:
        'Pattern of harassment across multiple comments. Permanent ban issued.',
      similarityScore: 0.76,
      resolvedAt: '2026-05-18T09:00:00Z',
    },
  ],
  lowQuality: [
    {
      id: 'case-lq-1',
      title: 'One-word comment on detailed discussion post',
      summary:
        'User replied "lol" to a 2000-word analysis post. No contribution to the discussion.',
      outcome: 'removed',
      outcomeReason:
        'Violated Rule 2 (low-quality content). Comment did not contribute meaningfully.',
      similarityScore: 0.92,
      resolvedAt: '2026-05-25T11:00:00Z',
    },
    {
      id: 'case-lq-2',
      title: '"thoughts?" post with no body text',
      summary:
        'User submitted post with vague title and no supporting content.',
      outcome: 'removed',
      outcomeReason:
        'Violated Rule 2 and Rule 6. Post lacked substance and had clickbait title.',
      similarityScore: 0.85,
      resolvedAt: '2026-05-22T08:00:00Z',
    },
  ],
  spam: [
    {
      id: 'case-s-1',
      title: 'Product promotion post with affiliate links',
      summary:
        'New account posted promotional content with multiple external links.',
      outcome: 'removed',
      outcomeReason: 'Violated Rule 5 (spam). Account banned for commercial spam.',
      similarityScore: 0.94,
      resolvedAt: '2026-05-24T16:00:00Z',
    },
    {
      id: 'case-s-2',
      title: 'Get-rich-quick scheme posted across multiple subreddits',
      summary:
        'User spammed same "earn money fast" post to 10+ subreddits.',
      outcome: 'removed',
      outcomeReason:
        'Cross-subreddit spam pattern. Account suspended by Reddit admins.',
      similarityScore: 0.81,
      resolvedAt: '2026-05-21T13:00:00Z',
    },
  ],
  doxxing: [
    {
      id: 'case-d-1',
      title: 'Personal address shared in revenge post',
      summary:
        'User posted another person\'s home address and phone number in a retaliatory comment.',
      outcome: 'removed',
      outcomeReason:
        'Violated Rule 4 (personal information). Content removed and account permanently banned. Reported to Reddit admins.',
      similarityScore: 0.96,
      resolvedAt: '2026-05-19T22:00:00Z',
    },
  ],
  incivility: [
    {
      id: 'case-i-1',
      title: 'Escalating argument with personal attacks',
      summary:
        'Two users engaged in increasingly hostile exchange. Both resorted to insults after initial disagreement.',
      outcome: 'locked',
      outcomeReason:
        'Thread locked for incivility (Rule 7). Both users warned. Comments removed.',
      similarityScore: 0.83,
      resolvedAt: '2026-05-23T17:00:00Z',
    },
    {
      id: 'case-i-2',
      title: 'Passive-aggressive gatekeeping in newcomer thread',
      summary:
        'Experienced user dismissed newcomer questions with condescending tone.',
      outcome: 'warned',
      outcomeReason:
        'Content not severe enough for removal but user warned about civility expectations.',
      similarityScore: 0.71,
      resolvedAt: '2026-05-20T10:00:00Z',
    },
  ],
};

export function getMockUserProfile(username: string): UserProfile {
  if (MOCK_USERS[username]) {
    return { ...MOCK_USERS[username] };
  }
  return {
    username,
    accountCreated: '2025-06-01T00:00:00Z',
    accountAgeDays: 360,
    karma: 1200,
    commentKarma: 800,
    isNewAccount: false,
    previousViolations: 0,
    recentPosts: [
      {
        id: 'gen-post-1',
        type: 'comment',
        title: '',
        body: 'Interesting perspective, thanks for sharing.',
        subreddit: 'testsub',
        createdAt: '2026-05-26T10:00:00Z',
        score: 5,
        removed: false,
      },
      {
        id: 'gen-post-2',
        type: 'post',
        title: 'Question about community guidelines',
        body: 'I was wondering if anyone could clarify the rules around crossposting.',
        subreddit: 'testsub',
        createdAt: '2026-05-24T14:00:00Z',
        score: 12,
        removed: false,
      },
    ],
  };
}

export function getMockSimilarCases(category: string): SimilarCase[] {
  switch (category) {
    case 'harassment':
    case 'hate_speech':
      return [...(MOCK_SIMILAR_CASES.harassment ?? [])];
    case 'low_quality':
      return [...(MOCK_SIMILAR_CASES.lowQuality ?? [])];
    case 'spam':
      return [...(MOCK_SIMILAR_CASES.spam ?? [])];
    case 'doxxing':
    case 'personal_info':
      return [...(MOCK_SIMILAR_CASES.doxxing ?? [])];
    case 'incivility':
    case 'civility':
      return [...(MOCK_SIMILAR_CASES.incivility ?? [])];
    default:
      return [
        {
          id: 'case-gen-1',
          title: 'Similar content reviewed last week',
          summary: 'Content with similar characteristics was reviewed by mod team.',
          outcome: 'removed',
          outcomeReason: 'Violated subreddit content quality standards.',
          similarityScore: 0.65,
          resolvedAt: '2026-05-20T12:00:00Z',
        },
      ];
  }
}

export function getMockCollaborationStatus(
  queueItemId: string
): { isBeingReviewed: boolean; reviewerUsername?: string; startedAt?: string } {
  const hash = queueItemId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (hash % 3 === 0) {
    const reviewers = ['mod_sarah', 'mod_alex', 'mod_jordan'];
    return {
      isBeingReviewed: true,
      reviewerUsername: reviewers[hash % reviewers.length],
      startedAt: new Date(Date.now() - (hash % 300) * 1000).toISOString(),
    };
  }
  return { isBeingReviewed: false };
}

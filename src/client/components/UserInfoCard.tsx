import React from 'react';
import type { UserProfile } from '../../shared/types';

interface UserInfoCardProps {
  profile: UserProfile;
}

export const UserInfoCard: React.FC<UserInfoCardProps> = ({ profile }) => {
  const violationColor =
    profile.previousViolations >= 3
      ? 'text-red-400'
      : profile.previousViolations >= 1
        ? 'text-amber-400'
        : 'text-gray-400';

  return (
    <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          User Context
        </h3>
        {profile.isNewAccount && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
            NEW ACCOUNT
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-sm font-bold">
          {profile.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-200">
            u/{profile.username}
          </div>
          <div className="text-xs text-gray-500">
            Joined {formatDate(profile.accountCreated)} ·{' '}
            {profile.accountAgeDays}d old
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatBox label="Karma" value={fmtNum(profile.karma)} />
        <StatBox label="Comment" value={fmtNum(profile.commentKarma)} />
        <StatBox
          label="Violations"
          value={String(profile.previousViolations)}
          valueClassName={violationColor}
        />
      </div>

      {profile.recentPosts.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Recent Activity
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {profile.recentPosts.slice(0, 5).map((post) => (
              <div
                key={post.id}
                className={`text-xs p-2 rounded-lg ${
                  post.removed
                    ? 'bg-red-500/5 border border-red-500/20'
                    : 'bg-gray-900/40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`text-[10px] px-1 rounded ${
                      post.type === 'post'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}
                  >
                    {post.type}
                  </span>
                  <span className="text-gray-600">
                    {post.score > 0 ? '+' : ''}
                    {post.score}
                  </span>
                  {post.removed && (
                    <span className="text-[10px] text-red-400">removed</span>
                  )}
                </div>
                <div className="text-gray-400 truncate">
                  {post.type === 'post' ? post.title : post.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{
  label: string;
  value: string;
  valueClassName?: string;
}> = ({ label, value, valueClassName }) => (
  <div className="text-center p-2 rounded-lg bg-gray-900/50">
    <div className={`text-sm font-bold ${valueClassName ?? 'text-gray-200'}`}>
      {value}
    </div>
    <div className="text-[10px] text-gray-600">{label}</div>
  </div>
);

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

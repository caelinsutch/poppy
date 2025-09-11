import { relations } from 'drizzle-orm';
import { reservationHistory } from '../tables/restaurants';
import { users } from '../tables/users';
import { tasks } from '../tables/tasks';

export const reservationHistoryRelations = relations(reservationHistory, ({ one }) => ({
  user: one(users, {
    fields: [reservationHistory.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [reservationHistory.taskId],
    references: [tasks.id],
  }),
}));
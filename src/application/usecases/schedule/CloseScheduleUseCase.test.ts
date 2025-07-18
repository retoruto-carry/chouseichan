import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IScheduleRepository } from '../../../domain/repositories/interfaces';
import type { DomainSchedule } from '../../../domain/types/DomainTypes';
import { NotFoundError, RepositoryError } from '../../../infrastructure/repositories/errors';
import { CloseScheduleUseCase } from './CloseScheduleUseCase';

describe('CloseScheduleUseCase', () => {
  let useCase: CloseScheduleUseCase;
  let mockScheduleRepository: IScheduleRepository;

  const mockSchedule: DomainSchedule = {
    id: 'schedule-123',
    guildId: 'guild-123',
    channelId: 'channel-123',
    title: 'Test Schedule',
    dates: [{ id: 'date-1', datetime: '2024/01/20 19:00' }],
    createdBy: { id: 'user-123', username: 'TestUser' },
    authorId: 'user-123',
    status: 'open',
    notificationSent: false,
    totalResponses: 5,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockScheduleRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findByAuthor: vi.fn(),
      findByDeadlineRange: vi.fn(),
      delete: vi.fn(),
      findByMessageId: vi.fn(),
      countByGuild: vi.fn(),
      updateReminders: vi.fn(),
    } as any;

    useCase = new CloseScheduleUseCase(mockScheduleRepository);
  });

  describe('execute', () => {
    it('should close schedule successfully when user is authorized', async () => {
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(mockSchedule);
      vi.mocked(mockScheduleRepository.save).mockResolvedValueOnce(undefined);

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.schedule).toBeDefined();
      expect(result.schedule?.status).toBe('closed');

      // Verify repository calls
      expect(mockScheduleRepository.findById).toHaveBeenCalledWith('schedule-123', 'guild-123');
      expect(mockScheduleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'closed',
        })
      );
    });

    it('should return error when schedule not found', async () => {
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(null);

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['日程調整が見つかりません。']);
      expect(mockScheduleRepository.save).not.toHaveBeenCalled();
    });

    it('should return error when user is not authorized', async () => {
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(mockSchedule);

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'other-user-456', // Different user
      });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['権限がありません。']);
      expect(mockScheduleRepository.save).not.toHaveBeenCalled();
    });

    it('should return error when schedule is already closed', async () => {
      const closedSchedule = { ...mockSchedule, status: 'closed' as const };
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(closedSchedule);

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['この日程調整は既に締め切られています。']);
      expect(mockScheduleRepository.save).not.toHaveBeenCalled();
    });

    it('should handle NotFoundError from repository', async () => {
      vi.mocked(mockScheduleRepository.findById).mockRejectedValueOnce(
        new NotFoundError('Schedule', 'schedule-123')
      );

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('処理中にエラーが発生しました。');
    });

    it('should handle repository save errors', async () => {
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(mockSchedule);
      vi.mocked(mockScheduleRepository.save).mockRejectedValueOnce(
        new RepositoryError('Save failed', 'SAVE_ERROR')
      );

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('処理中にエラーが発生しました。');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(mockScheduleRepository.findById).mockRejectedValueOnce(
        new Error('Unexpected error')
      );

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('処理中にエラーが発生しました。');
    });

    it('should preserve totalResponses when closing', async () => {
      const scheduleWithResponses = { ...mockSchedule, totalResponses: 10 };
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(scheduleWithResponses);
      vi.mocked(mockScheduleRepository.save).mockResolvedValueOnce(undefined);

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.schedule?.totalResponses).toBe(10);

      // Verify saved data preserves totalResponses
      const savedSchedule = vi.mocked(mockScheduleRepository.save).mock.calls[0][0];
      expect(savedSchedule.totalResponses).toBe(10);
    });

    it('should update updatedAt timestamp when closing', async () => {
      const beforeUpdate = new Date();
      vi.mocked(mockScheduleRepository.findById).mockResolvedValueOnce(mockSchedule);
      vi.mocked(mockScheduleRepository.save).mockResolvedValueOnce(undefined);

      const result = await useCase.execute({
        scheduleId: 'schedule-123',
        guildId: 'guild-123',
        editorUserId: 'user-123',
      });

      expect(result.success).toBe(true);

      // Verify updatedAt is recent
      const savedSchedule = vi.mocked(mockScheduleRepository.save).mock.calls[0][0];
      expect(savedSchedule.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });
});

/**
 * Vote Controller
 *
 * 投票機能のコントローラー
 * 元: src/handlers/vote-handlers.ts の Clean Architecture版
 */

import { InteractionResponseType } from 'discord-interactions';
import type { ScheduleResponseDto } from '../../application/dto/ScheduleDto';
import { MessageUpdateType } from '../../application/types/MessageUpdateType';
import { DependencyContainer } from '../../di/DependencyContainer';
import { getLogger } from '../../infrastructure/logging/Logger';
import type { ButtonInteraction, Env, ModalInteraction } from '../../infrastructure/types/discord';
import type { DiscordComponent } from '../../infrastructure/types/discord-api';
import { VoteUIBuilder } from '../builders/VoteUIBuilder';
import { sendFollowupMessage, updateOriginalMessage } from '../utils/discord';
import { getDisplayName } from '../utils/discord-helpers';
import { createScheduleEmbedWithTable, createSimpleScheduleComponents } from '../utils/embeds';

export interface CreateResponseMessageOptions {
  readonly schedule: ScheduleResponseDto;
  readonly responses: Array<{ dateId: string; status: 'ok' | 'maybe' | 'ng' }>;
  readonly username: string;
}

export interface UpdateMainMessageOptions {
  readonly scheduleId: string;
  readonly messageId: string;
  readonly interactionToken: string;
  readonly env: Env;
  readonly guildId: string;
}

import { createEphemeralResponse, createErrorResponse } from '../utils/responses';

export class VoteController {
  private readonly logger = getLogger();

  constructor(
    private readonly dependencyContainer: DependencyContainer,
    private readonly uiBuilder: VoteUIBuilder
  ) {}

  /**
   * 回答ボタン処理
   */
  async handleRespondButton(
    interaction: ButtonInteraction,
    params: string[],
    env: Env
  ): Promise<Response> {
    try {
      const [scheduleId] = params;
      const guildId = interaction.guild_id || 'default';
      const userId = interaction.member?.user.id || interaction.user?.id || '';

      // Get schedule using Clean Architecture
      const scheduleResult = await this.dependencyContainer.getScheduleUseCase.execute(
        scheduleId,
        guildId
      );
      if (!scheduleResult.success || !scheduleResult.schedule) {
        return createErrorResponse('日程調整が見つかりません。');
      }
      const schedule = scheduleResult.schedule;

      if (schedule.status === 'closed') {
        return createErrorResponse('この日程調整は締め切られています。');
      }

      // Save message ID if not already saved
      if (interaction.message?.id && !schedule.messageId) {
        await this.dependencyContainer.updateScheduleUseCase.execute({
          scheduleId,
          guildId,
          editorUserId: userId,
          messageId: interaction.message.id,
        });
      }

      // Get current user's responses
      const responseResult = await this.dependencyContainer.getResponseUseCase.execute({
        scheduleId,
        userId,
        guildId,
      });

      // ResponseDto の dateStatuses を使用
      const currentResponses = [];
      if (responseResult.success && responseResult.response) {
        for (const [dateId, status] of Object.entries(responseResult.response.dateStatuses)) {
          currentResponses.push({ dateId, status });
        }
      }

      // Create vote select menus
      const selectMenus = this.uiBuilder.createVoteSelectMenus(
        schedule,
        responseResult.response || null
      );

      // Discord制限: 1メッセージあたり最大5個のセレクトメニュー
      // 5個ずつのグループに分割
      const componentGroups: DiscordComponent[][] = [];
      for (let i = 0; i < selectMenus.length; i += 5) {
        componentGroups.push(selectMenus.slice(i, i + 5));
      }

      // 最初のグループをコンポーネントに追加
      const components = [...componentGroups[0]];

      // 複数グループがある場合はフォローアップメッセージを送信
      if (componentGroups.length > 1 && env.DISCORD_APPLICATION_ID) {
        const sendFollowups = async () => {
          for (let i = 1; i < componentGroups.length; i++) {
            await sendFollowupMessage({
              applicationId: env.DISCORD_APPLICATION_ID,
              token: interaction.token,
              data: {
                content: `📝 **${schedule.title}** の回答（続き ${i + 1}/${componentGroups.length}）`,
                components: componentGroups[i],
                flags: 64, // Ephemeral
              },
            });
          }
        };

        // waitUntilを使って非同期で送信
        if (env.ctx && typeof env.ctx.waitUntil === 'function') {
          env.ctx.waitUntil(sendFollowups());
        } else {
          // フォールバック
          sendFollowups().catch((error) =>
            this.logger.error(
              'Failed to send followup messages',
              error instanceof Error ? error : new Error(String(error))
            )
          );
        }
      }

      // 複数メッセージの場合は最初のメッセージに件数を表示
      const content =
        componentGroups.length > 1
          ? `📝 **${schedule.title}** の回答（1/${componentGroups.length}）\n\n各日程について回答を選択してください：\n-# ※投票反映には約5秒~10秒かかります\n`
          : `📝 **${schedule.title}** の回答\n\n各日程について回答を選択してください：\n-# ※投票反映には約5秒~10秒かかります\n`;

      return new Response(
        JSON.stringify({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content,
            components,
            flags: 64, // Ephemeral
          },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      this.logger.error(
        'Error handling respond button',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'handle-respond-button',
          useCase: 'VoteController',
          scheduleId: params[0],
          guildId: interaction.guild_id,
        }
      );
      return createErrorResponse('エラーが発生しました。');
    }
  }

  /**
   * 詳細表示トグルボタン処理
   */
  async handleToggleDetailsButton(
    interaction: ButtonInteraction,
    params: string[],
    _env: Env
  ): Promise<Response> {
    try {
      const [scheduleId, currentState] = params;
      const guildId = interaction.guild_id || 'default';
      const showDetails = currentState !== 'true';

      // Get schedule and summary using Clean Architecture
      const scheduleResult = await this.dependencyContainer.getScheduleUseCase.execute(
        scheduleId,
        guildId
      );
      if (!scheduleResult.success || !scheduleResult.schedule) {
        return createErrorResponse('日程調整が見つかりません。');
      }

      const summaryResult = await this.dependencyContainer.getScheduleSummaryUseCase.execute(
        scheduleId,
        guildId
      );
      if (!summaryResult.success || !summaryResult.summary) {
        return createErrorResponse('サマリー情報の取得に失敗しました。');
      }

      // Update the message with new state
      const embed = createScheduleEmbedWithTable({ summary: summaryResult.summary, showDetails });
      const components = createSimpleScheduleComponents({
        schedule: scheduleResult.schedule,
        showDetails,
      });

      return new Response(
        JSON.stringify({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            embeds: [embed],
            components,
          },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      this.logger.error(
        'Error toggling details',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'toggle-details',
          useCase: 'VoteController',
          scheduleId: params[0],
          guildId: interaction.guild_id,
        }
      );
      return createErrorResponse('表示の切り替えに失敗しました。');
    }
  }

  /**
   * 投票モーダル処理
   */
  async handleVoteModal(
    interaction: ModalInteraction,
    params: string[],
    _env: Env
  ): Promise<Response> {
    try {
      const [scheduleId] = params;
      const guildId = interaction.guild_id || 'default';
      const userId = interaction.member?.user.id || interaction.user?.id || '';
      const username = getDisplayName(interaction);

      // Get schedule using Clean Architecture
      const scheduleResult = await this.dependencyContainer.getScheduleUseCase.execute(
        scheduleId,
        guildId
      );
      if (!scheduleResult.success || !scheduleResult.schedule) {
        return createErrorResponse('日程調整が見つかりません。');
      }
      const schedule = scheduleResult.schedule;

      if (schedule.status === 'closed' && schedule.createdBy.id !== userId) {
        return createErrorResponse('この日程調整は締め切られています。');
      }

      // Parse responses from modal
      const components = interaction.data.components;
      const responses: Array<{ dateId: string; status: 'ok' | 'maybe' | 'ng' }> = [];

      // Parse each date response
      for (let i = 0; i < schedule.dates.length && i < components.length; i++) {
        const dateId = schedule.dates[i].id;
        const value = components[i]?.components[0]?.value || '';
        const trimmedValue = value.trim().toLowerCase();

        let status: 'ok' | 'maybe' | 'ng' = 'ng';
        if (trimmedValue === 'o' || trimmedValue === '○' || trimmedValue === '◯') {
          status = 'ok';
        } else if (trimmedValue === '△' || trimmedValue === '▲') {
          status = 'maybe';
        }

        responses.push({ dateId, status });
      }

      // Submit response using Clean Architecture
      const submitResult = await this.dependencyContainer.submitResponseUseCase.execute({
        scheduleId,
        userId,
        username,
        displayName: username, // username is already the display name from getDisplayName()
        responses,
        guildId,
      });

      if (!submitResult.success) {
        return createErrorResponse('回答の保存に失敗しました。');
      }

      // Send response message
      const responseContent = this.createResponseMessage({ schedule, responses, username });

      // Update main message using MessageUpdateService
      if (schedule.messageId && schedule.channelId) {
        const messageUpdateService = this.dependencyContainer.messageUpdateService;
        if (messageUpdateService) {
          await messageUpdateService.scheduleUpdate({
            scheduleId,
            messageId: schedule.messageId,
            channelId: schedule.channelId,
            guildId,
            updateType: MessageUpdateType.VOTE_UPDATE,
          });
        }
      }

      return createEphemeralResponse(responseContent);
    } catch (error) {
      this.logger.error(
        'Error handling vote modal',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'handle-vote-modal',
          useCase: 'VoteController',
          scheduleId: params[0],
          guildId: interaction.guild_id,
          userId: interaction.member?.user.id || interaction.user?.id,
        }
      );
      return createErrorResponse('回答の処理中にエラーが発生しました。');
    }
  }

  /**
   * 締切ボタン処理
   */
  async handleCloseButton(
    interaction: ButtonInteraction,
    params: string[],
    env: Env
  ): Promise<Response> {
    try {
      const [scheduleId] = params;
      const guildId = interaction.guild_id || 'default';
      const userId = interaction.member?.user.id || interaction.user?.id || '';

      // Get schedule using Clean Architecture
      const scheduleResult = await this.dependencyContainer.getScheduleUseCase.execute(
        scheduleId,
        guildId
      );
      if (!scheduleResult.success || !scheduleResult.schedule) {
        return createErrorResponse('日程調整が見つかりません。');
      }
      const schedule = scheduleResult.schedule;

      // Check permissions
      if (schedule.createdBy.id !== userId) {
        return createErrorResponse('この日程調整を締め切る権限がありません。');
      }

      if (schedule.status === 'closed') {
        return createErrorResponse('この日程調整は締め切られています。');
      }

      // Close schedule using Clean Architecture
      const closeResult = await this.dependencyContainer.closeScheduleUseCase.execute({
        scheduleId,
        guildId,
        editorUserId: userId,
      });

      if (!closeResult.success) {
        return createErrorResponse('日程調整の締切に失敗しました。');
      }

      // Send notifications in background
      if (env.ctx && env.DISCORD_TOKEN && env.DISCORD_APPLICATION_ID) {
        // 締切時は即座に最終更新を実行
        if (schedule.messageId && schedule.channelId) {
          const messageUpdateService = this.dependencyContainer.messageUpdateService;
          if (messageUpdateService) {
            await messageUpdateService.scheduleUpdate({
              scheduleId,
              messageId: schedule.messageId,
              channelId: schedule.channelId,
              guildId,
              updateType: MessageUpdateType.CLOSE_UPDATE,
            });
          }
        }

        env.ctx.waitUntil(this.sendClosureNotifications(scheduleId, guildId, env));
      }

      return createEphemeralResponse(
        '✅ 日程調整を締め切りました。\n📊 集計結果と個人宛通知を送信しています...'
      );
    } catch (error) {
      this.logger.error(
        'Error closing schedule',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'close-schedule',
          useCase: 'VoteController',
          scheduleId: params[0],
          guildId: interaction.guild_id,
          userId: interaction.member?.user.id || interaction.user?.id,
        }
      );
      return createErrorResponse('締切処理中にエラーが発生しました。');
    }
  }

  /**
   * 締切通知を送信
   */
  private async sendClosureNotifications(
    scheduleId: string,
    guildId: string,
    _env: Env
  ): Promise<void> {
    try {
      // Get NotificationService from DependencyContainer
      const notificationService = this.dependencyContainer.applicationServices.notificationService;

      if (!notificationService) {
        throw new Error(
          'NotificationService is not available - Discord credentials may not be configured'
        );
      }

      // Send summary message
      await notificationService.sendSummaryMessage(scheduleId, guildId);

      // Get schedule for PR message
      const scheduleResult = await this.dependencyContainer.getScheduleUseCase.execute(
        scheduleId,
        guildId
      );
      if (scheduleResult.success && scheduleResult.schedule) {
        notificationService.sendPRMessage(scheduleResult.schedule);
      }
    } catch (error) {
      this.logger.error(
        'Error sending closure notifications',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'send-closure-notifications',
          useCase: 'VoteController',
          scheduleId,
          guildId,
        }
      );
    }
  }

  /**
   * メインメッセージを更新
   */
  private async updateMainMessage(options: UpdateMainMessageOptions): Promise<void> {
    const { scheduleId, messageId, interactionToken, env, guildId } = options;
    try {
      if (!env.DISCORD_APPLICATION_ID) {
        return;
      }

      // Get latest schedule and summary
      const scheduleResult = await this.dependencyContainer.getScheduleUseCase.execute(
        scheduleId,
        guildId
      );
      if (!scheduleResult.success || !scheduleResult.schedule) {
        return;
      }

      const summaryResult = await this.dependencyContainer.getScheduleSummaryUseCase.execute(
        scheduleId,
        guildId
      );
      if (!summaryResult.success || !summaryResult.summary) {
        return;
      }

      // Update the message
      const embed = createScheduleEmbedWithTable({
        summary: summaryResult.summary,
        showDetails: false,
      });
      const components = createSimpleScheduleComponents({
        schedule: scheduleResult.schedule,
        showDetails: false,
      });

      await updateOriginalMessage({
        applicationId: env.DISCORD_APPLICATION_ID,
        token: interactionToken,
        data: {
          embeds: [embed],
          components,
        },
        messageId,
      });
    } catch (error) {
      this.logger.error(
        'Error updating main message',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'update-main-message',
          useCase: 'VoteController',
          scheduleId,
          messageId,
          guildId,
        }
      );
    }
  }

  /**
   * 回答メッセージを作成
   */
  private createResponseMessage(options: CreateResponseMessageOptions): string {
    const { schedule, responses, username } = options;
    const lines = [`✅ ${username} さんの回答を受け付けました！\n`];

    // Add response summary
    for (const response of responses) {
      const date = schedule.dates.find((d) => d.id === response.dateId);
      if (date) {
        const statusEmoji =
          response.status === 'ok' ? '○' : response.status === 'maybe' ? '△' : '×';
        lines.push(`${statusEmoji} ${date.datetime}`);
      }
    }

    return lines.join('\n');
  }
}

export function createVoteController(env: Env): VoteController {
  const container = new DependencyContainer(env);
  const uiBuilder = new VoteUIBuilder();
  return new VoteController(container, uiBuilder);
}

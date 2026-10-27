import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/** In-process event bus so REST services can notify the Socket.IO gateway without circular imports. */
@Injectable()
export class MeetingEvents extends EventEmitter {}

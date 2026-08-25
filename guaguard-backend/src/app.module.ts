import { Module } from '@nestjs/common';
import { Gt06Module } from './gt06/gt06.module';

@Module({
  imports: [Gt06Module],
})
export class AppModule {}

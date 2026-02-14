import { Module } from '@nestjs/common';
import { ComputerUseService } from './computer-use.service';
import { ComputerUseController } from './computer-use.controller';
import { NutModule } from '../nut/nut.module';
import { AccessibilityService } from './accessibility.service';

@Module({
  imports: [NutModule],
  controllers: [ComputerUseController],
  providers: [ComputerUseService, AccessibilityService],
  exports: [ComputerUseService, AccessibilityService],
})
export class ComputerUseModule {}

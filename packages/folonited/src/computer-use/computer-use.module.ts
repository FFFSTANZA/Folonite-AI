import { Module } from '@nestjs/common';
import { ComputerUseService } from './computer-use.service';
import { ComputerUseController } from './computer-use.controller';
import { NutModule } from '../nut/nut.module';
import { AccessibilityService } from './accessibility.service';
import { VisionService } from './vision.service';

@Module({
  imports: [NutModule],
  controllers: [ComputerUseController],
  providers: [ComputerUseService, AccessibilityService, VisionService],
  exports: [ComputerUseService, AccessibilityService, VisionService],
})
export class ComputerUseModule {}

#include "i2c.h"
#include "GT911.h"
// EPD
#include <SPI.h>
#include "Ap_29demo.h"
// IO settings

int IRQ_Pin = A0;
int touch_flag;
#define Is_INT_IN digitalRead(IRQ_Pin)

// IO settings
int BUSY_Pin = A14;
int RES_Pin = A15;
int DC_Pin = A16;
int CS_Pin = A17;
int CLEAR_Pin = A18;
int PAGE_Pin = A19;

#define EPD_W21_CS_0 digitalWrite(CS_Pin, LOW)
#define EPD_W21_CS_1 digitalWrite(CS_Pin, HIGH)
#define EPD_W21_DC_0 digitalWrite(DC_Pin, LOW)
#define EPD_W21_DC_1 digitalWrite(DC_Pin, HIGH)
#define EPD_W21_RST_0 digitalWrite(RES_Pin, LOW)
#define EPD_W21_RST_1 digitalWrite(RES_Pin, HIGH)
#define isEPD_W21_BUSY digitalRead(BUSY_Pin)

unsigned char Old_data[48000];

#define EPD_WIDTH 800
#define EPD_HEIGHT 480
// SPI
void SPI_Write(unsigned char value);
void EPD_W21_WriteCMD(unsigned char command);
void EPD_W21_WriteDATA(unsigned char data);

// EPD
void EPD_W21_Init(void);
void EPD_init(void);
void PIC_display(const unsigned char *picData);
void EPD_sleep(void);
void EPD_refresh(void);
void lcd_chkstatus(void);
void PIC_display_Clear(void);
// Display canvas function

void EPD_init_GUI(void);
void EPD_Refresh(void);
void EPD_display_init(void);
void EPD_partial_display(int x_start, int y_start, const unsigned char *new_data, unsigned int PART_COLUMN, unsigned int PART_LINE, unsigned char mode); // partial display
void EPD_init_Fast(void);
void PIC_display_Part(const unsigned char *picData);
void EPD_SetRAMValue_BaseMap(const unsigned char *datas);

void EPD_SetRAMValue_Solid(unsigned char value)
{
  EPD_W21_WriteCMD(0x10);

  for (int i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0xFF);
  }

  EPD_W21_WriteCMD(0x13);

  for (int i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(value);
  }

  EPD_W21_WriteCMD(0x12);
  delay(1);
  lcd_chkstatus();
}

void setup()
{
  Serial.begin(115200);
  pinMode(A0, INPUT_PULLUP);
  // epd
  pinMode(BUSY_Pin, INPUT);
  pinMode(RES_Pin, OUTPUT);
  pinMode(DC_Pin, OUTPUT);
  pinMode(CS_Pin, OUTPUT);
  // SPI
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  SPI.begin();

  pinMode(CLEAR_Pin, INPUT_PULLUP);
  pinMode(PAGE_Pin, INPUT_PULLUP);
}
// Tips//
/*When the electronic paper is refreshed in full screen, the picture flicker is a normal phenomenon, and the main function is to clear the display afterimage in the previous picture.
  When the local refresh is performed, the screen does not flash.*/
/*When you need to transplant the driver, you only need to change the corresponding IO. The BUSY pin is the input mode and the others are the output mode. */
int EpdNum;
void loop()
{

  unsigned char i, temp1;
  Serial.print("System is run OK\r\n"); // GT911
  GT9XX_Initial();                      // Touch init

  EPD_init_Fast();                          // EPD init Fast
  EPD_SetRAMValue_BaseMap(gImage_basemapT); // EPD_picture1
  EPD_display_init();
  EPD_partial_display(368, 166, Num[0], 104, 48, 1); // x,y,old_data,new_data,W,L,mode

  bool clearWasPressed = false;
  bool pageWasPressed = false;

  while (1)
  {
    // print button state, default value is High due to internal pullup resistor
    bool clearPressed = digitalRead(CLEAR_Pin) == LOW;
    bool pagePressed = digitalRead(PAGE_Pin) == LOW;

    if (clearPressed && !clearWasPressed)
    {
      Serial.println("CLEAR");

      EPD_init_Fast();
      PIC_display_Clear();

      // prepare again for subsequent partial updates
      EPD_display_init();
    }

    if (pagePressed && !pageWasPressed)
    {
      Serial.println("PAGE");
      EPD_partial_display(368, 166, Num[4], 104, 48, 1);
    }

    clearWasPressed = clearPressed;
    pageWasPressed = pagePressed;

    if (Is_INT_IN == 0) // Touch is OK
    {
      // printf("Is_INT_IN==0"); //print count
      TPR_Structure.TouchSta |= TP_COORD_UD;
      if (TPR_Structure.TouchSta & TP_COORD_UD)
      {
        TPR_Structure.TouchSta = 0;
        gt910_isr();
        if (TPR_Structure.x[0] != 0 && TPR_Structure.y[0] != 0)
        {
          // printf("Is_INT_IN==0\r\n"); //GT911
          printf("count:%d\r\n", touch_num); // print count
          printf("x0:%d,y0:%d\r\n", TPR_Structure.x[0], TPR_Structure.y[0]);
        }
        switch (touch_num)
        {
        case 1:
          // num++
          if ((TPR_Structure.x[0] != 0) && (TPR_Structure.y[0] != 0) && (TPR_Structure.x[0] > 500) && (TPR_Structure.x[0] < 800) && (TPR_Structure.y[0] > 0) && (TPR_Structure.y[0] < 480))
          {
            if (EpdNum < 9)
              EpdNum++;
            else
              EpdNum = 0;
            printf("EpdNum=%d\r\n", EpdNum);
            EPD_partial_display(368, 166, Num[EpdNum], 104, 48, 1); // x,y,old_data,new_data,W,L,mode
          }
          // num--
          else if ((TPR_Structure.x[0] != 0) && (TPR_Structure.y[0] != 0) && (TPR_Structure.x[0] > 0) && (TPR_Structure.x[0] < 300) && (TPR_Structure.y[0] > 0) && (TPR_Structure.y[0] < 480))
          {
            if (EpdNum > 0)
              EpdNum--;
            else
              EpdNum = 9;
            printf("EpdNum=%d\r\n", EpdNum);
            EPD_partial_display(368, 166, Num[EpdNum], 104, 48, 1); // x,y,old_data,new_data,W,L,mode
          }
          break;
        case 2:
          if ((TPR_Structure.x[0] != 0) && (TPR_Structure.y[0] != 0) && (TPR_Structure.x[1] != 0) && (TPR_Structure.y[1] != 0))
          {
            /*   Serial.print("count:%d\r\n",touch_num); //print count
               Serial.print("x0:%d,y0:%d\r\n",TPR_Structure.x[0],TPR_Structure.y[0]);
               Serial.print("x1:%d,y1:%d\r\n",TPR_Structure.x[1],TPR_Structure.y[1]);*/
          }
          break;

        default:
          break;
        }
        // Clear touch Coordinate data
        for (i = 0; i < 2; i++)
        {
          TPR_Structure.x[i] = 0;
          TPR_Structure.y[i] = 0;
        }
      }
    }
  }
}

//////////////////EXTERNAL FUNCTION////////////////////////////////////////////////////////////////////////
void SPI_Write(unsigned char value)
{
  SPI.transfer(value);
}
void EPD_W21_WriteCMD(unsigned char command)
{
  EPD_W21_CS_0;
  EPD_W21_DC_0; // command write
  SPI_Write(command);
  EPD_W21_CS_1;
}
void EPD_W21_WriteDATA(unsigned char data)
{
  EPD_W21_CS_0;
  EPD_W21_DC_1; // data write
  SPI_Write(data);
  EPD_W21_CS_1;
}

/////////////////EPD settings Functions/////////////////////

void EPD_W21_Init(void)
{
  EPD_W21_RST_0; // Module reset
  delay(10);     // At least 10ms delay
  EPD_W21_RST_1;
  delay(10); // At least 10ms delay
}
void EPD_Refresh(void)
{
  EPD_W21_WriteCMD(0x92); // Enter normal mode
  // Refresh
  EPD_W21_WriteCMD(0x12); // DISPLAY REFRESH
  delay(1);               //!!!The delay here is necessary, 200uS at least!!!
  lcd_chkstatus();
}
void EPD_Display(unsigned char *Image)
{
  unsigned int Width, Height, i, j;
  Width = (EPD_WIDTH % 8 == 0) ? (EPD_WIDTH / 8) : (EPD_WIDTH / 8 + 1);
  Height = EPD_HEIGHT;

  EPD_W21_WriteCMD(0x10);
  for (j = 0; j < Height; j++)
  {
    for (i = 0; i < Width; i++)
    {
      EPD_W21_WriteDATA(~Image[i + j * Width]);
    }
  }

  EPD_W21_WriteCMD(0x13);
  for (j = 0; j < Height; j++)
  {
    for (i = 0; i < Width; i++)
    {
      EPD_W21_WriteDATA(0x00);
    }
  }
  EPD_W21_WriteCMD(0x12); // DISPLAY REFRESH
  delay(1);               //!!!The delay here is necessary, 200uS at least!!!
  lcd_chkstatus();
}

// UC8179
void EPD_init(void)
{
  EPD_W21_Init(); // Electronic paper IC reset
  delay(100);     // reset IC and select BUS

  EPD_W21_WriteCMD(0x00);
  EPD_W21_WriteDATA(0x1F);

  EPD_W21_WriteCMD(0x04); // POWER ON
  delay(300);
  lcd_chkstatus();
  EPD_W21_WriteCMD(0X50); // VCOM AND DATA INTERVAL SETTING
  EPD_W21_WriteDATA(0x21);
  EPD_W21_WriteDATA(0x07);
}
void EPD_init_Fast(void)
{
  EPD_W21_RST_0; // Module reset
  delay(10);     // At least 10ms delay
  EPD_W21_RST_1;
  delay(10); // At least 10ms delay

  EPD_W21_WriteCMD(0X00);  // PANNEL SETTING
  EPD_W21_WriteDATA(0x1F); // KW-3f   KWR-2F BWROTP 0f BWOTP 1f

  EPD_W21_WriteCMD(0X50); // VCOM AND DATA INTERVAL SETTING
  EPD_W21_WriteDATA(0x10);
  EPD_W21_WriteDATA(0x07);

  EPD_W21_WriteCMD(0x04); // POWER ON
  delay(100);
  lcd_chkstatus(); // waiting for the electronic paper IC to release the idle signal

  // Enhanced display drive(Add 0x06 command)
  EPD_W21_WriteCMD(0x06); // Booster Soft Start
  EPD_W21_WriteDATA(0x27);
  EPD_W21_WriteDATA(0x27);
  EPD_W21_WriteDATA(0x18);
  EPD_W21_WriteDATA(0x17);

  EPD_W21_WriteCMD(0xE0);
  EPD_W21_WriteDATA(0x02);
  EPD_W21_WriteCMD(0xE5);
  EPD_W21_WriteDATA(0x5A);
}
void EPD_display_init(void)
{
  EPD_W21_RST_0; // Module reset
  delay(10);     // At least 10ms delay
  EPD_W21_RST_1;
  delay(10); // At least 10ms delay

  EPD_W21_WriteCMD(0X00);  // PANNEL SETTING
  EPD_W21_WriteDATA(0x1F); // KW-3f   KWR-2F BWROTP 0f BWOTP 1f

  EPD_W21_WriteCMD(0x04); // POWER ON
  delay(100);
  lcd_chkstatus(); // waiting for the electronic paper IC to release the idle signal

  EPD_W21_WriteCMD(0xE0);
  EPD_W21_WriteDATA(0x02);
  EPD_W21_WriteCMD(0xE5);
  EPD_W21_WriteDATA(0x6E);
}

void EPD_partial_display(int x_start, int y_start, const unsigned char *new_data, unsigned int PART_COLUMN, unsigned int PART_LINE, unsigned char mode) // partial display
{
  unsigned int i, count;
  unsigned int x_end, y_end;

  x_end = x_start + PART_LINE - 1;
  y_end = y_start + PART_COLUMN - 1;
  count = PART_COLUMN * PART_LINE / 8;

  EPD_W21_WriteCMD(0x50);
  EPD_W21_WriteDATA(0xA9);
  EPD_W21_WriteDATA(0x07);

  EPD_W21_WriteCMD(0x91); // This command makes the display enter partial mode
  EPD_W21_WriteCMD(0x90); // resolution setting
  EPD_W21_WriteDATA(x_start / 256);
  EPD_W21_WriteDATA(x_start % 256); // x-start

  EPD_W21_WriteDATA(x_end / 256);
  EPD_W21_WriteDATA(x_end % 256 - 1); // x-end

  EPD_W21_WriteDATA(y_start / 256); //
  EPD_W21_WriteDATA(y_start % 256); // y-start

  EPD_W21_WriteDATA(y_end / 256);
  EPD_W21_WriteDATA(y_end % 256 - 1); // y-end
  EPD_W21_WriteDATA(0x01);

  EPD_W21_WriteCMD(0x13); // writes New data to SRAM.
  for (i = 0; i < count; i++)
  {
    EPD_W21_WriteDATA(new_data[i]);
  }

  EPD_W21_WriteCMD(0x12); // DISPLAY REFRESH
  delay(10);              //!!!The delay here is necessary, 200uS at least!!!
  lcd_chkstatus();
  EPD_W21_WriteCMD(0X92); // This command makes the display exit partial mode and enter normal mode.
}
// UC8179
void EPD_init_GUI(void)
{
  unsigned int i;
  EPD_W21_Init(); // Electronic paper IC reset

  EPD_W21_WriteCMD(0x04); // POWER ON
  lcd_chkstatus();        // waiting for the electronic paper IC to release the idle signal

  EPD_W21_WriteCMD(0X00);  // PANNEL SETTING
  EPD_W21_WriteDATA(0x0F); // KW-3f   KWR-2F BWROTP 0f BWOTP 1f

  EPD_W21_WriteCMD(0X50); // VCOM AND DATA INTERVAL SETTING
  EPD_W21_WriteDATA(0x20);
  EPD_W21_WriteDATA(0x07);

  EPD_W21_WriteCMD(0x10); // Transfer old data
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0x00);
  }
  EPD_W21_WriteCMD(0x13); // Transfer new data
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0x00); // Transfer the actual displayed data
  }
}
void EPD_sleep(void)
{
  EPD_W21_WriteCMD(0X50);  // VCOM AND DATA INTERVAL SETTING
  EPD_W21_WriteDATA(0xf7); // WBmode:VBDF 17|D7 VBDW 97 VBDB 57    WBRmode:VBDF F7 VBDW 77 VBDB 37  VBDR B7

  EPD_W21_WriteCMD(0X02); // power off
  lcd_chkstatus();        // waiting for the electronic paper IC to release the idle signal
  delay(100);             //!!!The delay here is necessary, 200uS at least!!!
  EPD_W21_WriteCMD(0X07); // deep sleep
  EPD_W21_WriteDATA(0xA5);
}

void PIC_display(const unsigned char *picData)
{
  unsigned int i;
  // Write Data
  EPD_W21_WriteCMD(0x10);
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0x00);
  }
  EPD_W21_WriteCMD(0x13);
  for (i = 0; i < 48000; i++)
  {

    EPD_W21_WriteDATA(picData[i]);
  }
  // Refresh
  EPD_W21_WriteCMD(0x12); // DISPLAY REFRESH
  delay(1);               //!!!The delay here is necessary, 200uS at least!!!
  lcd_chkstatus();        // waiting for the electronic paper IC to release the idle signal
}
void EPD_SetRAMValue_BaseMap(const unsigned char *datas)
{
  unsigned int i;
  EPD_W21_WriteCMD(0x10); // write old data
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0xFF); // is  different
  }
  EPD_W21_WriteCMD(0x13); // write new data
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(datas[i]);
  }
  // Refresh
  EPD_W21_WriteCMD(0x12); // DISPLAY REFRESH
  delay(1);               //!!!The delay here is necessary, 200uS at least!!!
  lcd_chkstatus();        // waiting for the electronic paper IC to release the idle signal
}
/*
void PIC_display_Part(const unsigned char* picData)
{
    unsigned int i;
    //Write Data
    EPD_W21_WriteCMD(0x10);
    for(i=0;i<48000;i++)
    {
      EPD_W21_WriteDATA(Old_data[i]);
    }
    EPD_W21_WriteCMD(0x13);
    for(i=0;i<48000;i++)
    {

      EPD_W21_WriteDATA(picData[i]);
      Old_data[i]=picData[i];
    }
   //Refresh
    EPD_W21_WriteCMD(0x12);   //DISPLAY REFRESH
    delay(1);   //!!!The delay here is necessary, 200uS at least!!!
    lcd_chkstatus();          //waiting for the electronic paper IC to release the idle signal


}*/
void PIC_display_Clear(void)
{
  unsigned int i;
  // Write Data
  EPD_W21_WriteCMD(0x10);
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0x00);
  }
  EPD_W21_WriteCMD(0x13);
  for (i = 0; i < 48000; i++)
  {
    EPD_W21_WriteDATA(0x00);
  }
  // Refresh
  EPD_W21_WriteCMD(0x12); // DISPLAY REFRESH
  delay(1);               //!!!The delay here is necessary, 200uS at least!!!
  lcd_chkstatus();        // waiting for the electronic paper IC to release the idle signal
}

void lcd_chkstatus(void)
{
  while (!isEPD_W21_BUSY)
    ; // 0:BUSY, 1:FREE
}

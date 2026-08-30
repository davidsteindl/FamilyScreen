#include "i2c.h"
#include "GT911.h"
#if __has_include(<Arduino.h>)
#include <Arduino.h>
#elif __has_include("Arduino.h")
#include "Arduino.h"
#else
#include <stdint.h>
#endif
/*
void delayMicroseconds(unsigned int xus)
{
  for(;xus>1;xus--);
}
*/

 void iic_init(void)
{
 //IO mode setting

//pinMode(T0, OUTPUT);   //GND
//pinMode(T3, OUTPUT);  //VCC

pinMode(A5, OUTPUT); //SCL 
pinMode(A4, OUTPUT); //SDA
pinMode(A0, INPUT);  // IRQ; GPIO36 has no internal pull-up
/******************************************************/
}




void IIC_delay(int dl)
{
  int i;
  while (dl--)
  {
    for (i = 0; i < 5; i++);
  }
}

#define IIC_Delay_COUNT 5

void iic_start(void)
{
  iic_sda_out();
    SDA_H();
    SCL_H();
    delayMicroseconds(10);
    SDA_L();
    delayMicroseconds(5);
    SCL_L();
    delayMicroseconds(10);
}

void iic_stop(void)
{
    iic_sda_out();
    SCL_L();
    SDA_L();
    delayMicroseconds(5);  
    SCL_H();
    delayMicroseconds(4);  
    SDA_H();
    delayMicroseconds(5);  
}

void iic_ack(void)
{
  SCL_L();
  iic_sda_out();
  SDA_L();
  delayMicroseconds(5);  
  SCL_H();
  delayMicroseconds(10);  
  SCL_L();
  delayMicroseconds(10); 
  SDA_H(); 
}

void iic_nack(void)
{
  SCL_L();
  iic_sda_out();
  SDA_H();
  delayMicroseconds(5); 
  SCL_H();
  delayMicroseconds(10); 
  SCL_L();
  delayMicroseconds(10); 
}

uint8_t iic_wait_ack(void)
{
  unsigned char ucErrTime=0;
  unsigned char redata;
  SDA_H();
  iic_sda_in();
  SCL_H();
  delayMicroseconds(10); 
  while(Is_SDA_IN != 0)
  { 
    ucErrTime++;
    if(ucErrTime>250)   //?????
    {
      iic_stop();  
      return E_Error;
    }
    }
   SCL_L();
    delayMicroseconds(10);
    return E_Ok;


  
  /*
  if(Is_SDA_IN != 0)
  {
    SCL_L();
    return (E_Error);
  }
  else
  {
    SCL_L();
    return (E_Ok);
  }
  
  */
}

uint8_t iic_write_byte(uint8_t dat, uint8_t cack)
{
  uint32_t i;

  iic_sda_out();
  SCL_L();
  for (i = 0; i < 8; i++)
  {
    if (dat & 0x80)
    {
        SDA_H();
    }
    else
    {
        SDA_L();
    }
    delayMicroseconds(10);
    SCL_H();
    delayMicroseconds(10); 
    SCL_L();
    delayMicroseconds(10); 
    dat <<= 1; 
  }
  if (cack)
  {
    return (iic_wait_ack()); 
  }
  else
  {
    return 0;
  }
}

uint8_t iic_read_byte(uint8_t ack)
{
  uint8_t temp = 0;
  uint32_t i;
  
  iic_sda_in(); 
  for (i = 0; i < 8; i++)
  {
    
    SCL_L();
    delayMicroseconds(10);
    SCL_H();
    delayMicroseconds(10);
    temp <<= 1;
    if(Is_SDA_IN != 0)
    {
      temp |= 0x01;
    }
    else
    {
      temp &= ~(0x01);
    }
    
    delayMicroseconds(5);
  }
  if (ack)
  {
    iic_ack();
  }
  else
  {
    iic_nack();
  }
  return (temp); 
}

#ifndef I2C_H
#define I2C_H 	
#include <arduino.h>

//I2C���ߺ���
#define SCL_L() digitalWrite(A5,LOW)
#define SCL_H() digitalWrite(A5,HIGH)
#define SDA_L()  digitalWrite(A4,LOW)
#define SDA_H()  digitalWrite(A4,HIGH) 
#define CLR_RST() digitalWrite(A3,LOW)
#define SET_RST() digitalWrite(A3,HIGH)
#define CLR_INT() digitalWrite(A0,LOW)
#define SET_INT() digitalWrite(A0,HIGH)

#define Is_SDA_IN digitalRead(A4)
//mode  setting
#define iic_sda_in()    pinMode(A4, INPUT)    //
#define iic_sda_out()   pinMode(A4, OUTPUT)   //

#define RST_OUT_Mode()   pinMode(A3, OUTPUT)  
#define SCL_OUT_Mode()   pinMode(A5, OUTPUT) 


#define E_Ok        0
#define E_Error     1

void iic_start(void);
void iic_stop(void);
void iic_ack(void);
void iic_nack(void);
uint8_t iic_wait_ack(void);
uint8_t iic_write_byte(uint8_t dat, uint8_t cack);
uint8_t iic_read_byte(uint8_t ack);
void iic_init(void);
#endif

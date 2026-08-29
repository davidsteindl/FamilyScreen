#include "GT911.h"
#include "i2c.h"
#include "stdio.h"
#include "string.h"
uint16_t point_x,point_y;
uint8_t Touch_success=0;
#define GTP_REG_HAVE_KEY                0x804E
#define GTP_REG_MATRIX_DRVNUM           0x8069     
#define GTP_REG_MATRIX_SENNUM           0x806A
#define GTP_REG_CONFIG_DATA   0x8047

#define GTP_BAK_REF_SEND                0
#define GTP_BAK_REF_STORE               1
#define CFG_LOC_DRVA_NUM                (29-2)
#define CFG_LOC_DRVB_NUM                (30-2)
#define CFG_LOC_SENS_NUM                (31-2)
#define GTP_REG_BAK_REF                 0x99D0
#define GTP_REG_MAIN_CLK                0x8020

#define _bRW_MISCTL__SRAM_BANK       0x4048
#define _bRW_MISCTL__MEM_CD_EN       0x4049
#define _bRW_MISCTL__CACHE_EN        0x404B
#define _bRW_MISCTL__TMR0_EN         0x40B0
#define _rRW_MISCTL__SWRST_B0_       0x4180
#define _bWO_MISCTL__CPU_SWRST_PULSE 0x4184
#define _rRW_MISCTL__BOOTCTL_B0_     0x4190
#define _rRW_MISCTL__BOOT_OPT_B0_    0x4218
#define _rRW_MISCTL__BOOT_CTL_       0x5094





struct goodix_ts_data ts;
uint8_t i2c_opr_buf[FL_PACK_SIZE] = {0};
uint8_t chk_cmp_buf[FL_PACK_SIZE] = {0};

uint16_t version_info;
uint8_t cfg[240] = {0};


uint8_t CTP_CFG_GROUP[] = {\
0x00,0xE0,0x01,0x20,0x03,0x0A,0x05,0x00,0x01,0x0F,\
0x28,0x0F,0x50,0x32,0x03,0x05,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x89,0x29,0x0A,\
0x52,0x50,0x0C,0x08,0x00,0x00,0x00,0x00,0x03,0x1D,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x32,0x00,0x00,\
0x00,0x48,0x70,0x94,0xC5,0x02,0x07,0x00,0x00,0x04,\
0x87,0x4B,0x00,0x7D,0x52,0x00,0x74,0x59,0x00,0x6B,\
0x62,0x00,0x64,0x6B,0x00,0x64,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x08,0x0A,0x0C,0x0E,0x10,0x12,0x14,0x16,\
0x18,0x1A,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x2A,0x29,0x28,0x24,0x22,0x20,0x1F,0x1E,\
0x1D,0x0E,0x0C,0x0A,0x08,0x06,0x05,0x04,0x02,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,\
0x00,0x00,0x00,0x00,0x00,0x00,0xAA,0x01};
struct CNTOUCH_DATA tds;

static void start_delay(int cnt)
{
  volatile unsigned int dl;
  while(cnt--)
  {
    for(dl=0; dl<500; dl++);
  }
}


void gtp_reset_guitar(void)
{
#ifdef GT910_ADDR_BABBH
   
  CLR_RST();
  CLR_INT();
  start_delay(100);    //15MS

  SET_RST();
  start_delay(50);    //5MS
  
  
#else
  CLR_RST();
  start_delay(500);
  SET_INT();
  start_delay(1000);
  SET_RST();
#endif
}

ErrorStatus gt910_write_reg(uint16_t reg_addr, uint32_t cnt, uint8_t *value)
{
  ErrorStatus err;
  uint32_t i;

  err = SUCCESS;
  iic_start();
  if (iic_write_byte(GT910_IIC_WADDR, 1) == E_Ok)
  {
    if (iic_write_byte((uint8_t)(reg_addr >> 8), 1) == E_Ok)
    {
      if (iic_write_byte((uint8_t)(reg_addr), 1) == E_Ok)
      {
        for(i = 0; i < cnt; i++)
        {
          if (iic_write_byte(value[i], 1) != E_Ok)
          {
            err = ERROR;            
            break;
          }
        }
      }
    }
  }

  iic_stop();
  return err;
}

ErrorStatus gt910_read_reg(uint16_t reg_addr, uint32_t cnt, uint8_t *value)
{
  ErrorStatus err;
  uint32_t i;

  err = ERROR;
  iic_start();
  if (iic_write_byte(GT910_IIC_WADDR, 1) == E_Ok)
  {
    if (iic_write_byte((uint8_t)(reg_addr >> 8), 1) == E_Ok)
    {
      if (iic_write_byte((uint8_t)(reg_addr), 1) == E_Ok)
      {
        iic_stop();
        iic_start();
        if (iic_write_byte(GT910_IIC_RADDR, 1) == E_Ok)
        {
          for(i = 0 ; i < cnt; i++)
          {
            if (i == (cnt - 1))
            {
              value[i] = iic_read_byte(0);
            }
            else
            {
              value[i] = iic_read_byte(1);
            }

          }         
          iic_stop();
          err = SUCCESS;
        }
      }
    }
  }
  iic_stop();
  return (err); 
}

static void gtp_get_chip_type(void)
{
  uint8_t temp[16] = {0};
  gt910_read_reg(GTP_REG_CHIP_TYPE,16,temp);
  if (!memcmp(temp,"GOODIX_GT9",10))
  {
    ts.chip_type = CHIP_TYPE_GT9;
  }
  else
  {
    ts.chip_type = CHIP_TYPE_GT9F;
  }
}


void gt910_int_sync(uint32_t dl_ms)
{
  CLR_INT();
  start_delay(dl_ms * 100);
 //gt910_int_init();
}

static ErrorStatus gtp_fw_startup()
{
  uint8_t opr_buf[4];
  ErrorStatus ret;
  
  opr_buf[0] = 0xAA;
  ret = gt910_write_reg(0x8040, 1,opr_buf);// i2c_write_bytes(client, 0x8041, opr_buf, 1);
  
  
  opr_buf[0] = 0xAA;
  ret = gt910_write_reg(0x8041, 1 ,opr_buf);
  
  if (ERROR == ret)
  {
    return ERROR;
  }

  //release SS51 & DSP
  opr_buf[0] = 0x00;  
  ret = gt910_write_reg(0x4180, 1 ,opr_buf);
  if (ERROR == ret)
  {
    return ERROR;
  }

  //int sync
  //gt910_int_sync(25);  ////////////////////////////////////////////////////////////////////////////////////////////

  //check fw run status

  ret = gt910_read_reg(0x8041,  1 ,opr_buf);

  if (ERROR == ret)
  {
    return ERROR;
  }
  if(0xAA == opr_buf[0])
  {
    return ERROR;
  }
  else
  {
    opr_buf[0] = 0xAA;
    gt910_write_reg(0x8040, 1 ,opr_buf);
    
    opr_buf[0] = 0xAA;
    gt910_write_reg(0x8041, 1 ,opr_buf);
    return SUCCESS;
  }
}



ErrorStatus gt910_read_version(uint16_t* version)
{
  ErrorStatus ret;
  uint8_t buf[8] = {0};

  ret = gt910_read_reg(GTP_REG_VERSION,6,buf);
  if (ret == ERROR)
  {

    return ret;
  }

  if (version)
  {
    *version = (buf[5] << 8) | buf[4];
  }
  
  return SUCCESS;
}


ErrorStatus gtp_init_panel(void)
{
  ErrorStatus ret;
  uint8_t check_sum = 0;
  uint8_t opr_buf[16] = {0};
  int32_t i;

  //start_delay(50*100);  //delay 50ms ////////////////////////////////////////////////////////////
  delay(50); //50ms  
  ret = gt910_read_reg(GTP_REG_SENSOR_ID,1,opr_buf);
  if (ret == ERROR)
  {
    return ERROR;
  }

  if (opr_buf[0] > 0x06)
  {
    return ERROR;
  }


  memset(cfg,0,240);

  memcpy(cfg,CTP_CFG_GROUP, 228);


  check_sum = 0;
  for (i = 0; i < 228; i++)
  {
    check_sum += cfg[i];
  }
  cfg[228] = (~check_sum) + 1;

  return SUCCESS;

}

static ErrorStatus gtp_send_cfg(void)
{
  ErrorStatus ret;


  int32_t retry = 0;
  
  for (retry = 0; retry < 5; retry++)
  {
    ret = gt910_write_reg(GTP_REG_CONFIG_DATA,228,CTP_CFG_GROUP);//cfg
    if (ret == SUCCESS)
    {
      break;
    }
  }

  return ret;
}


#define BAK_REF_LENGTH  (18*(10-2)+2)*2

  uint8_t p_bak_ref[BAK_REF_LENGTH] = {0};
  
ErrorStatus gtp_bak_ref_proc(uint8_t mode)
{
  ErrorStatus ret;
  uint16_t i =0;
  uint32_t ref_seg_len = 0;
  
  
  

  ref_seg_len = BAK_REF_LENGTH;
  ts.bak_ref_len = BAK_REF_LENGTH;

    
  for (i=0; i<ts.bak_ref_len; i++)
  {
    p_bak_ref[i] = 0;

  }
  p_bak_ref[ref_seg_len - 1] = 0x01; 
  
  ret = gt910_write_reg(GTP_REG_BAK_REF,ref_seg_len,p_bak_ref);//

  if (ret == ERROR)
  {
    return ERROR;
  }
  return SUCCESS;


}


static ErrorStatus gtp_main_clk_proc()
{
  uint32_t i = 0;
  uint32_t clk_chksum = 0;
  uint8_t p_main_clk[6] = {0};
  
  for (i = 0; i < 5; ++i)
  {
    p_main_clk[i] = 80;
    clk_chksum += p_main_clk[i];
  }
  p_main_clk[5] = 0 - clk_chksum;

  if(gt910_write_reg(GTP_REG_MAIN_CLK,6,p_main_clk) == ERROR)   
  {
    
    return ERROR;
  }
  return SUCCESS;

}



/******************************************************************************/
// Description: GT9XX_Read
// Dependence:  GETTING the data about touchpanel. the up-layer calls the 
//              function to get the data.
// Note:
/******************************************************************************/
#define GTP_RQST_CONFIG                 0x01
#define GTP_RQST_BAK_REF                0x02
#define GTP_RQST_RESET                  0x03
#define GTP_RQST_MAIN_CLOCK             0x04
#define GTP_RQST_RESPONDED              0x00
#define GTP_RQST_IDLE                   0xFF
extern uint16_t point_x,point_y;
extern uint8_t Touch_success;
uint8_t  touch_num = 0;
TouchPointRefTypeDef TPR_Structure; 
void gt910_isr(void)
{
  uint8_t  point_data[1 + 8 * GTP_MAX_TOUCH + 1];
  //uint8_t  touch_num = 0;
  uint8_t  finger = 0;

  ErrorStatus ret;

#if 1//GTP_COMPATIBLE_MODE
  uint8_t rqst_buf[16];  // for GT9XXF
#endif



  ret = gt910_read_reg(GTP_READ_COOR_ADDR,10,point_data);

  if (ret == ERROR)
  {
    goto exit_work_func;
  }

  finger = point_data[0];    
#if 1 //GTP_COMPATIBLE_MODE
  // GT9XXF
  if ((finger == 0x00) && (CHIP_TYPE_GT9F == ts.chip_type))     // request arrived
  {
    rqst_buf[0] = 0x00;
    ret = gt910_read_reg(0x8043,1,rqst_buf);
    if (ret == ERROR)
    {
      goto exit_work_func;
    } 

    switch (rqst_buf[0] & 0x0F)
    {
    case GTP_RQST_CONFIG:     //ÅäÖÃÇëÇó

      ret = gtp_send_cfg();
      if (ret == ERROR)
      {
        
      }
      else
      {
        rqst_buf[0] = GTP_RQST_RESPONDED;
        
        gt910_write_reg(0x8043,1,rqst_buf);
        
      }
      break;

    case GTP_RQST_BAK_REF:    //±¸·Ý»ù×¼
  
      ret = gtp_bak_ref_proc(GTP_BAK_REF_SEND); //bernard
      if (SUCCESS == ret)
      {
        rqst_buf[0] = GTP_RQST_RESPONDED;
        
        gt910_write_reg(0x8043,1,rqst_buf);
      }
      
      break;

    case GTP_RQST_MAIN_CLOCK:            //Ö÷ÆµÅäÖÃ
      
      ts.rqst_processing = 1;
      ret = gtp_main_clk_proc();             //bernard
      if (ERROR == ret)
      {
        
      }
      else
      {
        rqst_buf[0] = GTP_RQST_RESPONDED;
        gt910_write_reg(0x8043,1,rqst_buf);

      }
      Touch_success = 1;
      break;

    case GTP_RQST_IDLE:
    default:
      break;
    }
  }
#endif


  if((finger & 0x80) == 0)
  {
    goto exit_work_func;
  }

  
  touch_num = finger & 0x0f;
  if (touch_num > GTP_MAX_TOUCH) 
  {
    goto exit_work_func;
  }

  if (touch_num >= 1)            
  {
    ret = gt910_read_reg(GTP_READ_COOR_ADDR,8*(touch_num ),point_data);//&10
    switch(touch_num)
    {
      case 5:
      {
       printf("Anzahl:%d\r\n",touch_num); // Anzahl ausgeben
       printf("x0:%d,y0:%d\r\n",TPR_Structure.x[0],TPR_Structure.y[0]);
       printf("x1:%d,y1:%d\r\n",TPR_Structure.x[1],TPR_Structure.y[1]);   
       printf("x2:%d,y2:%d\r\n",TPR_Structure.x[2],TPR_Structure.y[2]); 
       printf("x3:%d,y3:%d\r\n",TPR_Structure.x[3],TPR_Structure.y[3]);   
       printf("x4:%d,y4:%d\r\n",TPR_Structure.x[4],TPR_Structure.y[4]);         

      }
      case 4:
      {
       printf("Anzahl:%d\r\n",touch_num); // Anzahl ausgeben
       printf("x0:%d,y0:%d\r\n",TPR_Structure.x[0],TPR_Structure.y[0]);
       printf("x1:%d,y1:%d\r\n",TPR_Structure.x[1],TPR_Structure.y[1]);   
       printf("x2:%d,y2:%d\r\n",TPR_Structure.x[2],TPR_Structure.y[2]); 
       printf("x3:%d,y3:%d\r\n",TPR_Structure.x[3],TPR_Structure.y[3]);             
      }
      case 3:
      {
        TPR_Structure.y[0]=(point_data[5+8*0]<<8) | point_data[4+8*0];
        TPR_Structure.x[0]=(point_data[3+8*0]<<8) | point_data[2+8*0];      
        TPR_Structure.y[1]=(point_data[5+8*1]<<8) | point_data[4+8*1];
        TPR_Structure.x[1]=(point_data[3+8*1]<<8) | point_data[2+8*1];
        TPR_Structure.y[2]=(point_data[5+8*2]<<8) | point_data[4+8*2];
        TPR_Structure.x[2]=(point_data[3+8*2]<<8) | point_data[2+8*2];
       printf("Anzahl:%d\r\n",touch_num); // Anzahl ausgeben
       printf("x0:%d,y0:%d\r\n",TPR_Structure.x[0],TPR_Structure.y[0]);
       printf("x1:%d,y1:%d\r\n",TPR_Structure.x[1],TPR_Structure.y[1]);   
       printf("x2:%d,y2:%d\r\n",TPR_Structure.x[2],TPR_Structure.y[2]);   
      }
      case 2:
      {
        TPR_Structure.y[0]=(point_data[5+0]<<8) | point_data[4+0];
        TPR_Structure.x[0]=(point_data[3+0]<<8) | point_data[2+0];      
        TPR_Structure.y[1]=(point_data[5+8]<<8) | point_data[4+8];
        TPR_Structure.x[1]=(point_data[3+8]<<8) | point_data[2+8];
      /* printf("Anzahl:%d\r\n",touch_num); // Anzahl ausgeben
       printf("x0:%d,y0:%d\r\n",TPR_Structure.x[0],TPR_Structure.y[0]);
       printf("x1:%d,y1:%d\r\n",TPR_Structure.x[1],TPR_Structure.y[1]);*/
        
      }
      case 1:
      {
        if(point_x!= ((point_data[3]<<8) | point_data[2])&&point_y!=((point_data[5]<<8) | point_data[4])) //ÅÅ³ýÁ½´Î´¥ÃþÍ¬Ò»¸öµãµÄÏÖÏó
        {
          TPR_Structure.y[0]=(point_data[5]<<8) | point_data[4];
          TPR_Structure.x[0]=(point_data[3]<<8) | point_data[2];
        }
        point_y = (point_data[5]<<8) | point_data[4];
        point_x = (point_data[3]<<8) | point_data[2];
        
              /* printf("Anzahl:%d\r\n",touch_num); // Anzahl ausgeben
               printf("x0:%d,y0:%d\r\n",point_x,point_y);*/
    

        break;        
      }
      default:break;
    }
    TPR_Structure.TouchSta |= TP_PRES_DOWN;     //´¥Ãþ°´ÏÂ±ê¼Ç    
  }

  else  //Èç¹ûÃ»ÓÐÓÐÐ§´¥Ãþ£¬¾Í·µ»Ø0xffff
    {
      if(TPR_Structure.TouchSta &TP_PRES_DOWN)  //Ö®Ç°ÊÇ±»°´ÏÂµÄ
          TPR_Structure.TouchSta &= ~0x80;        //´¥ÃþËÉ¿ª±ê¼Ç  
          else
          {
            TPR_Structure.x[0] = 0;
            TPR_Structure.y[0] = 0;
            TPR_Structure.TouchSta &=0xe0;  //Çå³ý´¥ÃþµãÓÐÐ§±ê¼Ç
          }
      
      point_x = 0xffff;
      point_y = 0xffff;

    }
exit_work_func:
  memset(rqst_buf,0,16);
  ret = gt910_write_reg(GTP_READ_COOR_ADDR,1,rqst_buf);
}

/******************************************************************************/
// Description: GT9XX_Initial
// Dependence: 
// Note:   GPIO_PROD_TP_INT_ID
/******************************************************************************/

ErrorStatus GT9XX_Initial(void)
{ 
  iic_init();
  return SUCCESS;
}

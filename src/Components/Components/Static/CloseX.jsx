import React from 'react';
import { IconContext } from 'react-icons';
import { IoCloseOutline } from 'react-icons/io5';

const CloseX = ({action, divStyle, IconStyle, backgroundColor=''}) => {
    return (
        <IconContext.Provider value={{ style: { background: backgroundColor, color:"black" },  className: IconStyle }}>
            <div className={divStyle}>
                <IoCloseOutline onClick={action}/>
            </div>
        </IconContext.Provider>

    );
};

export default CloseX;
import React from 'react';
import css from './Components.module.css';



const Buttons = (props) => {

    const buttonColor = props.class === "greenButton" ? css.greenSpring : css.redSpring
    const buttonType = props.size === "big" ? css.big : css.small


    return (
        <div className={buttonColor}>
            <div>{props.text}</div>
        </div>
    );
}

export default Buttons;

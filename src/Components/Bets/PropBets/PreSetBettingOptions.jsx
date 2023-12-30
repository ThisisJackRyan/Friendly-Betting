import React, { useState, useEffect } from 'react';
import css from './Prop.module.css';

const PreSetBettingOptions = (prop) => {
    const [howMany, setHowMany] = useState(0);
    const [howManyOptions, setHowManyOptions] = useState([]);

    const [options, setOptions] = useState([]);


    const addOptions = (e, i) => {
        setOptions((current) => {options[i] = e.target.value; return options});
    }

    const addOneMore = () => {
        setHowMany(howMany + 1);
    }

    useEffect(() => {
        let options = [];
        for (let i = 0; i < howMany; i++) {
            options.push(i);
        }
        setHowManyOptions(options);
    }, [howMany]);

    const handleSubmit = (e) => {
        e.preventDefault();
        prop.setOptions(options);
        console.log('Saving preset betting options');
    }

    return (
        <div className={css.PreSetBetting}>
            <div className={css.x}><span onClick={prop.display}>x</span></div>
            <div className={css.title}><span>Preset Betting Options</span></div>
            <form onSubmit={handleSubmit}>
                {howManyOptions.map((option, index) => (
                    <div className={css.option} key={index}>
                        <span className={css.label}>{option+1}:</span>
                        <input className={css.optionInput} type="text" onChange={(e) => addOptions(e, index)} placeholder='Who or what' />
                    </div>
                ))}
                <button type="submit">Save</button>
            </form>
                <button onClick={addOneMore}>Add Option</button>
        </div>
    );
};

export default PreSetBettingOptions;